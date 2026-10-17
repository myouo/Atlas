import type { DashboardReadModel } from "@nivalis/api-client";

import { composeNativeSvg, widgetProvider, type PublishedWidget } from "./svg-renderer";
import { SVG_STYLES, SVG_THEMES, type SvgStyle, type SvgTheme } from "./svg-theme";
import { loadNativeScene } from "./native-svg-service";
import type { NativeSvgScene } from "./native-svg-types";
import { handleScenePublication } from "./scene-publication";

const MAX_DASHBOARD_BYTES = 16_000_000;

const aliases: Readonly<Record<string, string>> = {
  "/netease/ranking.svg": "music.netease.ranking",
  "/netease/identity.svg": "music.netease.identity",
  "/netease/playlists.svg": "music.netease.playlists",
  "/netease/showcase.svg": "music.netease.showcase",
  "/netease/calendar.svg": "music.netease.calendar",
  "/steam/profile.svg": "steam.profile"
};

type Selection =
  | { readonly kind: "dashboard" }
  | { readonly kind: "manifest" }
  | { readonly kind: "profile" }
  | { readonly kind: "provider"; readonly value: string }
  | { readonly kind: "widget-id"; readonly value: string }
  | { readonly kind: "widget-type"; readonly value: string };

export function createSvgWorker<Environment extends Pick<Env, "NIVALIS_API" | "SITE_URL">>(
  loadScene: (
    dashboard: DashboardReadModel,
    options: URLSearchParams,
    env: Environment
  ) => Promise<NativeSvgScene>
) {
  return {
    async fetch(request: Request, env: Environment): Promise<Response> {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { headers: { Allow: "GET, HEAD" }, status: 405 });
      }
      const url = new URL(request.url);
      const selection = selectRoute(url.pathname, url.searchParams);
      if (!selection) return new Response("Card not found", { status: 404 });
      for (const [parameter, values] of [
        ["style", SVG_STYLES],
        ["theme", SVG_THEMES]
      ] as const) {
        const value = url.searchParams.get(parameter);
        if (value !== null && !values.some((allowed) => allowed === value)) {
          return new Response(`Invalid ${parameter}; expected ${values.join(" or ")}`, {
            status: 400,
            headers: { "Cache-Control": "no-store" }
          });
        }
      }

      let dashboard: DashboardReadModel;
      try {
        dashboard = await loadPublishedDashboard(env.NIVALIS_API);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "svg_dashboard_unavailable",
            reason: error instanceof Error ? error.name : "unknown"
          })
        );
        return new Response("Published dashboard unavailable", {
          headers: { "Cache-Control": "no-store" },
          status: 503
        });
      }

      if (selection.kind === "manifest") {
        const enabled = dashboard.widgets.filter((widget) => widget.enabled);
        const providerNames = [...new Set(enabled.map(widgetProvider))].sort();
        const manifest = {
          render: renderUrl(url.origin),
          dashboard: renderUrl(url.origin),
          profile: renderUrl(url.origin, { view: "profile" }),
          netease: renderUrl(url.origin, { provider: "netease" }),
          styles: SVG_STYLES,
          themes: SVG_THEMES,
          variants: renderVariants(url.origin),
          profileVariants: renderVariants(url.origin, { view: "profile" }),
          providers: providerNames.map((provider) => ({
            provider,
            svg: renderUrl(url.origin, { provider }),
            variants: renderVariants(url.origin, { provider })
          })),
          site: env.SITE_URL,
          widgets: enabled.map((widget) => ({
            id: widget.id,
            title: widget.title,
            type: widget.type,
            provider: widgetProvider(widget),
            svg: renderUrl(url.origin, { id: widget.id }),
            typeSvg: renderUrl(url.origin, { type: widget.type, id: widget.id }),
            variants: renderVariants(url.origin, { id: widget.id }),
            ...(widget.type.startsWith("music.netease.")
              ? {
                  vinylSvg: renderUrl(url.origin, { id: widget.id, style: "vinyl", theme: "dark" })
                }
              : {})
          }))
        };
        return new Response(request.method === "HEAD" ? null : JSON.stringify(manifest), {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

      let selected: readonly PublishedWidget[];
      if (selection.kind === "dashboard")
        selected = dashboard.widgets.filter((widget) => widget.enabled);
      else if (selection.kind === "provider") {
        if (
          !dashboard.widgets.some(
            (widget) => widget.enabled && widgetProvider(widget) === selection.value
          )
        )
          return new Response("Published provider cards not found", { status: 404 });
        selected = dashboard.widgets.filter(
          (widget) => widget.enabled && widgetProvider(widget) === selection.value
        );
      } else if (selection.kind === "profile") selected = [];
      else {
        const widget = selectWidget(
          dashboard.widgets,
          selection,
          url.searchParams.get("id"),
          url.searchParams.get("provider")
        );
        if (!widget) return new Response("Published card not found", { status: 404 });
        selected = [widget];
      }

      let svg: string;
      let capture: NativeSvgScene;
      try {
        const scene = await loadScene(dashboard, url.searchParams, env);
        capture = scene;
        const ids = new Set(selected.map((widget) => widget.id));
        const cards = scene.widgets.filter((card) => ids.has(card.id));
        if (selection.kind === "profile" || selection.kind === "dashboard")
          cards.unshift(scene.profile);
        if (!cards.length) return new Response("Published Web card not found", { status: 404 });
        svg = composeNativeSvg(
          `${dashboard.profile.displayName} · About Me`,
          cards,
          url.searchParams
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "svg_native_capture_unavailable",
            reason: error instanceof Error ? error.name : "unknown"
          })
        );
        return new Response("Published Web cards temporarily unavailable", {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            ...(url.hostname.endsWith(".workers.dev") && error instanceof Error
              ? {
                  "X-Nivalis-Capture-Error": error.message
                    .replace(/[^\x20-\x7e]/g, " ")
                    .slice(0, 220)
                }
              : {})
          }
        });
      }

      const etag = await svgEtag(svg);
      const headers = new Headers({
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        "Content-Security-Policy":
          "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'",
        "Content-Type": "image/svg+xml; charset=utf-8",
        ETag: etag,
        ...(capture.capturedAt ? { "X-Nivalis-SVG-Captured-At": capture.capturedAt } : {}),
        ...(capture.contentHash
          ? { "X-Nivalis-SVG-State": capture.outdated ? "previous-success" : "current" }
          : {}),
        "X-Content-Type-Options": "nosniff"
      });
      if (etagMatches(request.headers.get("If-None-Match"), etag)) {
        return new Response(null, { headers, status: 304 });
      }
      return new Response(request.method === "HEAD" ? null : svg, { headers });
    }
  };
}

const publicWorker = createSvgWorker<Env>(loadNativeScene);

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/internal/scenes")
      return handleScenePublication(request, env, loadPublishedDashboard);
    return publicWorker.fetch(request, env);
  }
} satisfies ExportedHandler<Env>;

export function selectRoute(
  pathname: string,
  options: URLSearchParams = new URLSearchParams()
): Selection | null {
  if (pathname === "/" || pathname === "/dashboard.svg" || pathname === "/render.svg") {
    const view = options.get("view");
    const provider = options.get("provider");
    const type = options.get("type");
    const id = options.get("id");
    if (view !== null && view !== "profile" && view !== "dashboard") return null;
    if (provider !== null && !/^[a-z0-9_-]{1,64}$/.test(provider)) return null;
    if (type !== null && !/^[a-z0-9._-]{1,100}$/.test(type)) return null;
    if (id !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
    if (view === "profile") {
      return provider || type || id ? null : { kind: "profile" };
    }
    if (type) return { kind: "widget-type", value: type };
    if (id) return { kind: "widget-id", value: id };
    if (provider) return { kind: "provider", value: provider };
    return { kind: "dashboard" };
  }
  if (pathname === "/manifest.json") return { kind: "manifest" };
  if (pathname === "/profile.svg") return { kind: "profile" };
  if (pathname === "/netease.svg" || pathname === "/netease/dashboard.svg")
    return { kind: "provider", value: "netease" };
  const provider = pathname.match(/^\/providers\/([a-z0-9_-]{1,64})\.svg$/)?.[1];
  if (provider) return { kind: "provider", value: provider };
  const alias = aliases[pathname];
  if (alias) return { kind: "widget-type", value: alias };
  const widgetId = pathname.match(/^\/widgets\/([^/]+)\.svg$/)?.[1];
  if (widgetId && /^[a-zA-Z0-9_-]{1,100}$/.test(widgetId)) {
    return { kind: "widget-id", value: widgetId };
  }
  const widgetType = pathname.match(/^\/types\/([^/]+)\.svg$/)?.[1];
  if (widgetType && /^[a-z0-9._-]{1,100}$/.test(widgetType)) {
    return { kind: "widget-type", value: widgetType };
  }
  return null;
}

function selectWidget(
  widgets: readonly PublishedWidget[],
  selection: Extract<Selection, { readonly kind: "widget-id" | "widget-type" }>,
  requestedId: string | null,
  requestedProvider: string | null
) {
  const enabled = widgets.filter(
    (widget) =>
      widget.enabled && (!requestedProvider || widgetProvider(widget) === requestedProvider)
  );
  if (selection.kind === "widget-id") {
    return enabled.find((widget) => widget.id === selection.value);
  }
  return enabled.find(
    (widget) => widget.type === selection.value && (!requestedId || widget.id === requestedId)
  );
}

function renderUrl(origin: string, selection: Readonly<Record<string, string>> = {}) {
  const url = new URL("/render.svg", origin);
  for (const [key, value] of Object.entries(selection)) url.searchParams.set(key, value);
  return url.toString();
}

function renderVariants(origin: string, selection: Readonly<Record<string, string>> = {}) {
  const variant = (style: SvgStyle, theme: SvgTheme) =>
    renderUrl(origin, { ...selection, style, theme });
  return {
    soft: { light: variant("soft", "light"), dark: variant("soft", "dark") },
    vinyl: { light: variant("vinyl", "light"), dark: variant("vinyl", "dark") }
  };
}

async function loadPublishedDashboard(service: Fetcher): Promise<DashboardReadModel> {
  const response = await service.fetch(
    new Request("https://nivalis.internal/v1/public/dashboards/about", {
      headers: { Accept: "application/json", "Accept-Encoding": "identity" },
      method: "GET"
    })
  );
  if (!response.ok) throw new Error(`Public API returned ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DASHBOARD_BYTES) {
    throw new Error("Public dashboard exceeds SVG render budget");
  }
  if (!response.body) throw new Error("Public dashboard response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_DASHBOARD_BYTES) {
      await reader.cancel();
      throw new Error("Public dashboard exceeds SVG render budget");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isDashboard(value)) throw new Error("Public dashboard shape is invalid");
  return value;
}

function isDashboard(value: unknown): value is DashboardReadModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const profile = candidate.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return false;
  const fields = profile as Record<string, unknown>;
  return (
    candidate.dashboardId === "about" &&
    typeof fields.displayName === "string" &&
    typeof fields.handle === "string" &&
    typeof fields.headline === "string" &&
    typeof fields.bio === "string" &&
    Array.isArray(fields.tags) &&
    fields.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(candidate.widgets) &&
    candidate.widgets.every((widget) => {
      if (!widget || typeof widget !== "object" || Array.isArray(widget)) return false;
      const row = widget as Record<string, unknown>;
      return (
        typeof row.id === "string" &&
        typeof row.type === "string" &&
        typeof row.title === "string" &&
        typeof row.enabled === "boolean" &&
        typeof row.schemaVersion === "number" &&
        typeof row.stale === "boolean"
      );
    })
  );
}

async function svgEtag(svg: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg));
  const hex = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `"svg:${hex}"`;
}

function etagMatches(header: string | null, etag: string) {
  return (
    header?.split(",").some((candidate) => {
      const value = candidate.trim();
      return value === "*" || value.replace(/^W\//, "") === etag;
    }) ?? false
  );
}
