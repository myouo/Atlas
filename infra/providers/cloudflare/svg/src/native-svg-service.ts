import type { DashboardReadModel } from "@nivalis/api-client";
import type { NativeSvgCard, NativeSvgScene } from "./native-svg-types";
import type { captureCard, finishCard } from "./browser-capture";
import { svgAppearance, SVG_STYLES, SVG_THEMES } from "./svg-theme";

declare global {
  interface Window {
    NivalisCapture: { captureCard: typeof captureCard; finishCard: typeof finishCard };
  }
}

const CAPTURE_VERSION = "web-components-v5-original-variants";
const CACHE_SECONDS = 24 * 60 * 60;

export async function loadNativeScene(
  dashboard: DashboardReadModel,
  options: URLSearchParams,
  env: Env
): Promise<NativeSvgScene> {
  const { style, theme } = svgAppearance(options);
  const range = options.get("range") === "all_time" ? "all_time" : "week";
  const period = options.get("period") === "week" ? "week" : "month";
  const body = JSON.stringify(dashboard);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const key = `${CAPTURE_VERSION}:${hash}:${style}:${theme}:${range}:${period}`;
  const cached = await env.SVG_CACHE.get<NativeSvgScene>(key, "json");
  if (cached) return cached;
  const { default: puppeteer } = await import("@cloudflare/puppeteer");
  const browser = await puppeteer.launch(env.BROWSER);
  let stage = "page_setup";
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    const assets = new Map<string, Promise<string>>();
    const sourceOrigin = new URL(env.SITE_URL).origin;
    const pendingRequests: Promise<void>[] = [];
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = new URL(request.url());
      const operation =
        url.origin === sourceOrigin && url.pathname === "/api/v1/public/dashboards/about"
          ? request.respond({ status: 200, contentType: "application/json", body })
          : url.origin === sourceOrigin && url.pathname === "/api/v1/auth/session"
            ? request.respond({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                  actorId: null,
                  authenticated: false,
                  expiresAt: null,
                  role: null
                })
              })
            : request.continue();
      pendingRequests.push(operation);
      void operation.catch(() => undefined);
    });
    page.on("response", (response) => {
      if (response.request().resourceType() !== "image" || !response.ok()) return;
      const type = response.headers()["content-type"]?.split(";")[0];
      if (!type?.startsWith("image/")) return;
      const image = response.buffer().then((buffer) => {
        if (buffer.byteLength > 2_000_000) throw new Error("Artwork exceeds export budget");
        return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
      });
      assets.set(response.url(), image);
      void image.catch(() => undefined);
    });
    stage = "navigate";
    await page.goto(env.SITE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    stage = "wait_for_web_cards";
    await page.waitForSelector("section[data-widget-id]", { timeout: 30_000 });
    stage = "capture_library";
    const library = await env.CAPTURE_ASSETS.fetch(
      new Request("https://capture.internal/capture.js")
    );
    if (!library.ok) throw new Error("Native capture library is unavailable");
    await page.addScriptTag({ content: await library.text() });
    await page.addStyleTag({
      content:
        ".module-shell{content-visibility:visible!important}*,*::before,*::after{animation:none!important;transition:none!important}"
    });
    await page.evaluate(
      ({ range, period }) => {
        for (const card of document.querySelectorAll<HTMLElement>("section[data-widget-id]")) {
          const type = card.dataset.widgetType;
          const label =
            type === "music.netease.ranking"
              ? range === "all_time"
                ? "全部时间"
                : "最近一周"
              : type === "music.netease.calendar"
                ? period === "week"
                  ? "本周"
                  : "本月"
                : null;
          if (!label) continue;
          const button = [
            ...card.querySelectorAll<HTMLButtonElement>(".netease-sliding-switcher button")
          ].find((button) => button.textContent?.trim() === label);
          button?.click();
        }
      },
      { range, period }
    );
    const cards: NativeSvgCard[] = [];
    stage = "capture_cards";
    const backdrops = new Map<string, string>();
    for (const widget of dashboard.widgets.filter((widget) => widget.enabled)) {
      const card = await page.$(`section[data-widget-id="${widget.id}"]`);
      if (!card) continue;
      await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await page.waitForFunction(
        (id) =>
          [
            ...document.querySelectorAll<HTMLImageElement>(`section[data-widget-id="${id}"] img`)
          ].every((image) => Boolean(image.getAttribute("src"))),
        { timeout: 10_000 },
        widget.id
      );
      await card.evaluate(async (element) => {
        await Promise.all(
          [...element.querySelectorAll<HTMLImageElement>("img")].map(async (image) => {
            image.loading = "eager";
            try {
              await image.decode();
            } catch {
              /* Match the Web's existing empty-artwork state. */
            }
          })
        );
      });
      const captured = await card.evaluate(
        (element, meta) =>
          window.NivalisCapture.captureCard(element as HTMLElement, meta.id, meta.type, meta.title),
        { id: widget.id, type: widget.type, title: widget.title }
      );
      cards.push(captured);
    }
    stage = "capture_profile";
    const profile = await page.$(".dashboard-intro");
    if (!profile) throw new Error("Published profile is not rendered");
    await profile.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const capturedProfile = await profile.evaluate((element) =>
      window.NivalisCapture.captureCard(element as HTMLElement, "profile", "profile", "About Me")
    );
    stage = "capture_backgrounds";
    for (const captured of cards) {
      const card = await page.$(`section[data-widget-id="${captured.id}"]`);
      if (!card) continue;
      await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const clip = await card.boundingBox();
      if (!clip) continue;
      await page.evaluate(() =>
        document
          .querySelectorAll<HTMLElement>(".module-shell")
          .forEach((element) => (element.style.visibility = "hidden"))
      );
      const backdrop = await page.screenshot({ type: "png", clip });
      backdrops.set(
        captured.id,
        `data:image/png;base64,${Buffer.from(backdrop).toString("base64")}`
      );
      await page.evaluate(() =>
        document
          .querySelectorAll<HTMLElement>(".module-shell")
          .forEach((element) => (element.style.visibility = ""))
      );
    }
    await Promise.all(pendingRequests);
    const embedded: Record<string, string> = {};
    for (const [url, image] of assets) {
      try {
        embedded[url] = await image;
      } catch {
        /* An uncaptured decoded image fails finishCard explicitly. */
      }
    }
    const requiredImages = await page.evaluate(
      (cards) => [
        ...new Set(
          cards.flatMap((card) => {
            const svg = new DOMParser().parseFromString(card.svg, "image/svg+xml");
            return [...svg.querySelectorAll("image")]
              .map((image) => image.getAttribute("xlink:href") ?? image.getAttribute("href"))
              .filter((url): url is string => Boolean(url) && !url!.startsWith("data:"));
          })
        )
      ],
      [...cards, capturedProfile]
    );
    let nextImage = 0;
    const embedImage = async (url: string) => {
      const asset = new URL(url, env.SITE_URL);
      if (embedded[url] && !asset.hostname.endsWith("music.126.net")) return;
      const ownHost = asset.hostname === new URL(env.SITE_URL).hostname;
      const providerHost =
        /(?:^|\.)(?:music\.126\.net|githubusercontent\.com|steamstatic\.com)$/.test(asset.hostname);
      if (asset.protocol !== "https:" || (!ownHost && !providerHost))
        throw new Error("Unrecognized public artwork host");
      if (asset.hostname.endsWith("music.126.net")) asset.searchParams.set("param", "128y128");
      const response = await fetch(asset.toString(), { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Public artwork HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2_000_000) throw new Error("Artwork exceeds export budget");
      embedded[url] =
        `data:${response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;
    };
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (nextImage < requiredImages.length) {
          const url = requiredImages[nextImage++];
          if (url) await embedImage(url);
        }
      })
    );
    stage = "embed_artwork";
    let requested: NativeSvgScene | null = null;
    for (const variantStyle of SVG_STYLES)
      for (const variantTheme of SVG_THEMES) {
        const scene = await page.evaluate(
          ({ cards, profile, assets, backdrops, theme, style }) => ({
            profile: window.NivalisCapture.finishCard(profile, assets, null, theme, style),
            widgets: cards.map((card) =>
              window.NivalisCapture.finishCard(
                card,
                assets,
                backdrops[card.id] ?? null,
                theme,
                style
              )
            )
          }),
          {
            cards,
            profile: capturedProfile,
            assets: embedded,
            backdrops: Object.fromEntries(backdrops),
            theme: variantTheme,
            style: variantStyle
          }
        );
        const serialized = JSON.stringify(scene);
        if (new TextEncoder().encode(serialized).byteLength > 12_000_000)
          throw new Error("Native scene exceeds export budget");
        stage = "cache_write";
        const variantKey = `${CAPTURE_VERSION}:${hash}:${variantStyle}:${variantTheme}:${range}:${period}`;
        await env.SVG_CACHE.put(variantKey, serialized, { expirationTtl: CACHE_SECONDS });
        if (variantStyle === style && variantTheme === theme) requested = scene;
      }
    if (!requested) throw new Error("Requested native variant was not generated");
    return requested;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "native_svg_capture_failed",
        stage,
        reason: error instanceof Error ? error.message.slice(0, 250) : "unknown"
      })
    );
    throw new Error(
      `${stage}: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`,
      { cause: error }
    );
  } finally {
    await browser.close();
  }
}
