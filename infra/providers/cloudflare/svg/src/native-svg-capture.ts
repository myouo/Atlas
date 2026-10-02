import type { Page } from "@playwright/test";
import type { DashboardReadModel } from "@nivalis/api-client";
import type { NativeSvgCard, NativeSvgScene } from "./native-svg-types";
import type { captureCard, finishCard } from "./browser-capture";
import { SVG_STYLES, SVG_THEMES, type SvgStyle, type SvgTheme } from "./svg-theme";

declare global {
  interface Window {
    NivalisCapture: { captureCard: typeof captureCard; finishCard: typeof finishCard };
  }
}

export interface CapturedVariant {
  readonly style: SvgStyle;
  readonly theme: SvgTheme;
  readonly range: "week" | "all_time";
  readonly period: "month" | "week";
  readonly scene: NativeSvgScene;
}

// Node/CI capture deliberately uses the same Web DOM converter as the original
// browser export. Serving an image never imports or launches a browser.
export async function captureNativeVariants(
  dashboard: DashboardReadModel,
  page: Page,
  siteUrl: string,
  library: string,
  range: "week" | "all_time",
  period: "month" | "week"
): Promise<CapturedVariant[]> {
  const body = JSON.stringify(dashboard);
  let stage = "page_setup";
  try {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const assets = new Map<string, Promise<string>>();
    const sourceOrigin = new URL(siteUrl).origin;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === sourceOrigin && url.pathname === "/api/v1/public/dashboards/about")
        await route.fulfill({ status: 200, contentType: "application/json", body });
      else if (url.origin === sourceOrigin && url.pathname === "/api/v1/auth/session")
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ actorId: null, authenticated: false, expiresAt: null, role: null })
        });
      else await route.continue();
    });
    page.on("response", (response) => {
      if (response.request().resourceType() !== "image" || !response.ok()) return;
      const type = response.headers()["content-type"]?.split(";")[0];
      if (!type?.startsWith("image/")) return;
      const image = response.body().then((buffer) => {
        if (buffer.byteLength > 2_000_000) throw new Error("Artwork exceeds export budget");
        return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
      });
      assets.set(response.url(), image);
      void image.catch(() => undefined);
    });
    stage = "navigate";
    await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    stage = "wait_for_web_cards";
    await page.waitForSelector("section[data-widget-id]", { timeout: 30_000 });
    // Existing profile exports intentionally retain the original website card theme.
    await page.evaluate(() => {
      document.documentElement.dataset.cardStyle = "glass";
    });
    stage = "capture_library";
    await page.addScriptTag({ content: library });
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
      if (!card) throw new Error(`Published card ${widget.id} is not rendered`);
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
        widget.id,
        { timeout: 10_000 }
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
      const asset = new URL(url, siteUrl);
      if (embedded[url] && !asset.hostname.endsWith("music.126.net")) return;
      const ownHost = asset.hostname === new URL(siteUrl).hostname;
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
    const variants: CapturedVariant[] = [];
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
        variants.push({ style: variantStyle, theme: variantTheme, range, period, scene });
      }
    return variants;
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
  }
}
