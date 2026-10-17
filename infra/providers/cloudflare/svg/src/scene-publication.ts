import { timingSafeEqual } from "node:crypto";
import type { DashboardReadModel } from "@nivalis/api-client";
import { NATIVE_CAPTURE_VERSION } from "./native-scene-cache";
import { publishNativeScene, sceneKeys, type PublishedScene } from "./native-svg-service";
import type { NativeSvgCard } from "./native-svg-types";
import { SVG_STYLES, SVG_THEMES } from "./svg-theme";

const MAX_UPLOAD_BYTES = 12_000_000;

export async function handleScenePublication(
  request: Request,
  env: Pick<Env, "SVG_CACHE" | "SVG_PUBLISH_TOKEN" | "NIVALIS_API">,
  loadDashboard: (service: Fetcher) => Promise<DashboardReadModel>
): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" };
  const token =
    request.headers.get("Authorization")?.match(/^Bearer ([\x21-\x7e]{1,256})$/)?.[1] ?? "";
  const expected = env.SVG_PUBLISH_TOKEN;
  if (
    !expected ||
    !token ||
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (request.method !== "POST" && request.method !== "GET")
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...noStore, Allow: "GET, POST" }
    });
  try {
    const dashboard = await loadDashboard(env.NIVALIS_API);
    if (request.method === "GET") {
      const variants = [];
      const fingerprints = await sceneKeys(dashboard, {
        range: "week",
        period: "month",
        style: "soft",
        theme: "light"
      });
      for (const range of ["week", "all_time"] as const)
        for (const period of ["month", "week"] as const)
          for (const style of SVG_STYLES)
            for (const theme of SVG_THEMES) {
              const options = { range, period, style, theme };
              const keys = await sceneKeys(dashboard, options, fingerprints);
              const current = await env.SVG_CACHE.get<
                Pick<PublishedScene, "contentHash" | "scopeHash" | "version" | "periodKey">
              >(`${keys.latest}:status`, "json");
              variants.push({
                ...options,
                ready:
                  current?.contentHash === keys.contentHash &&
                  current.scopeHash === keys.scopeHash &&
                  current.version === NATIVE_CAPTURE_VERSION &&
                  current.periodKey === keys.periodKey
              });
            }
      return Response.json(
        {
          version: NATIVE_CAPTURE_VERSION,
          contentHash: fingerprints.contentHash,
          scopeHash: fingerprints.scopeHash,
          variants
        },
        { headers: noStore }
      );
    }
    const value: unknown = JSON.parse(await boundedBody(request));
    if (!isPublishedScene(value, dashboard))
      return new Response("Invalid public SVG capture", { status: 400, headers: noStore });
    const keys = await sceneKeys(dashboard, value.options);
    if (
      value.contentHash !== keys.contentHash ||
      value.scopeHash !== keys.scopeHash ||
      value.version !== NATIVE_CAPTURE_VERSION
    )
      return new Response("Published dashboard changed during capture", {
        status: 409,
        headers: noStore
      });
    await publishNativeScene(dashboard, value, env.SVG_CACHE, keys);
    return Response.json({ published: true, capturedAt: value.capturedAt }, { headers: noStore });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "svg_publication_failed",
        reason: error instanceof Error ? error.name : "unknown"
      })
    );
    return new Response("SVG publication unavailable", { status: 503, headers: noStore });
  }
}

async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES || !request.body)
    throw new Error("SVG upload exceeds budget");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new Error("SVG upload exceeds budget");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isCard(value: unknown): value is NativeSvgCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    typeof card.type === "string" &&
    typeof card.title === "string" &&
    typeof card.width === "number" &&
    card.width > 0 &&
    card.width < 10_000 &&
    typeof card.height === "number" &&
    card.height > 0 &&
    card.height < 50_000 &&
    typeof card.svg === "string" &&
    /^<svg\b/.test(card.svg) &&
    !/<(?:script|foreignObject|iframe)\b|\bon\w+\s*=|javascript:/i.test(card.svg) &&
    [...card.svg.matchAll(/<image\b[^>]*?\b(?:xlink:)?href="([^"]*)"/g)].every((image) =>
      image[1]?.startsWith("data:image/")
    )
  );
}

function isPublishedScene(value: unknown, dashboard: DashboardReadModel): value is PublishedScene {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const options = row.options as Record<string, unknown> | undefined;
  const scene = row.scene as Record<string, unknown> | undefined;
  const enabled = dashboard.widgets.filter((widget) => widget.enabled);
  return (
    typeof row.version === "string" &&
    typeof row.contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(row.contentHash) &&
    typeof row.scopeHash === "string" &&
    /^[a-f0-9]{64}$/.test(row.scopeHash) &&
    typeof row.capturedAt === "string" &&
    Number.isFinite(Date.parse(row.capturedAt)) &&
    Date.parse(row.capturedAt) <= Date.now() + 60_000 &&
    Boolean(
      options &&
      SVG_STYLES.some((style) => style === options.style) &&
      SVG_THEMES.some((theme) => theme === options.theme) &&
      ["week", "all_time"].includes(String(options.range)) &&
      ["month", "week"].includes(String(options.period))
    ) &&
    Boolean(
      scene &&
      isCard(scene.profile) &&
      scene.profile.id === "profile" &&
      scene.profile.type === "profile" &&
      Array.isArray(scene.widgets) &&
      scene.widgets.length === enabled.length &&
      scene.widgets.every(isCard) &&
      new Set(scene.widgets.map((card) => card.id)).size === enabled.length &&
      enabled.every((widget) =>
        (scene.widgets as NativeSvgCard[]).some(
          (card) => card.id === widget.id && card.type === widget.type
        )
      )
    )
  );
}
