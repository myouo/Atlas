import type { DashboardReadModel } from "@nivalis/api-client";
import {
  NATIVE_CAPTURE_VERSION,
  nativeSceneContentHash,
  nativeSceneScopeHash
} from "./native-scene-cache";
import type { NativeSvgScene } from "./native-svg-types";
import { svgAppearance, type SvgStyle, type SvgTheme } from "./svg-theme";

export interface SceneOptions {
  readonly style: SvgStyle;
  readonly theme: SvgTheme;
  readonly range: "week" | "all_time";
  readonly period: "month" | "week";
}

export interface PublishedScene {
  readonly version: string;
  readonly contentHash: string;
  readonly scopeHash: string;
  readonly capturedAt: string;
  readonly options: SceneOptions;
  readonly scene: NativeSvgScene;
  readonly periodKey?: string;
}

export function sceneOptions(options: URLSearchParams): SceneOptions {
  return {
    ...svgAppearance(options),
    range: options.get("range") === "all_time" ? "all_time" : "week",
    period: options.get("period") === "week" ? "week" : "month"
  };
}

export async function sceneKeys(
  dashboard: DashboardReadModel,
  options: SceneOptions,
  fingerprints?: { contentHash: string; scopeHash: string }
) {
  const { contentHash, scopeHash } = fingerprints ?? {
    contentHash: await nativeSceneContentHash(dashboard),
    scopeHash: await nativeSceneScopeHash(dashboard)
  };
  const calendar = dashboard.widgets.find(
    (widget) => widget.enabled && widget.type === "music.netease.calendar"
  );
  const data = calendar?.data as
    { month?: { points?: { date: string }[] }; week?: { points?: { date: string }[] } } | undefined;
  const anchor = data?.[options.period]?.points?.[0]?.date;
  const calendarPeriod = anchor ? periodAnchor(anchor, options.period) : "none";
  const ranking = dashboard.widgets.find(
    (widget) => widget.enabled && widget.type === "music.netease.ranking"
  );
  const rankingPeriod =
    options.range === "week" && ranking?.updatedAt
      ? periodAnchor(
          new Date(new Date(ranking.updatedAt).getTime() + 8 * 3_600_000)
            .toISOString()
            .slice(0, 10),
          "week"
        )
      : "all";
  const variant = `${options.style}:${options.theme}:${options.range}:${options.period}`;
  const periodKey = `${calendarPeriod}:${rankingPeriod}`;
  return {
    contentHash,
    scopeHash,
    periodKey,
    exact: `${NATIVE_CAPTURE_VERSION}:published:${contentHash}:${variant}:${periodKey}`,
    latest: `${NATIVE_CAPTURE_VERSION}:latest:${dashboard.dashboardId}:${variant}`,
    legacyLatest: `${NATIVE_CAPTURE_VERSION}:latest:${scopeHash}:${variant}`
  };
}

function periodAnchor(date: string, period: "month" | "week") {
  if (period === "month") return date.slice(0, 7);
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export async function loadNativeScene(
  dashboard: DashboardReadModel,
  options: URLSearchParams,
  env: Pick<Env, "SVG_CACHE">
): Promise<NativeSvgScene> {
  const keys = await sceneKeys(dashboard, sceneOptions(options));
  const published =
    (await env.SVG_CACHE.get<PublishedScene>(keys.latest, "json")) ??
    (await env.SVG_CACHE.get<PublishedScene>(keys.legacyLatest, "json"));
  if (
    !published ||
    published.version !== NATIVE_CAPTURE_VERSION ||
    published.scopeHash !== keys.scopeHash ||
    published.periodKey !== keys.periodKey
  )
    throw new Error("A successful public SVG capture has not been published yet");
  return {
    ...published.scene,
    capturedAt: published.capturedAt,
    contentHash: published.contentHash,
    outdated: published.contentHash !== keys.contentHash
  };
}

export async function publishNativeScene(
  dashboard: DashboardReadModel,
  published: PublishedScene,
  cache: KVNamespace,
  verifiedKeys?: Awaited<ReturnType<typeof sceneKeys>>
) {
  const keys = verifiedKeys ?? (await sceneKeys(dashboard, published.options));
  if (
    published.version !== NATIVE_CAPTURE_VERSION ||
    published.contentHash !== keys.contentHash ||
    published.scopeHash !== keys.scopeHash
  )
    throw new Error("Published dashboard changed during capture");
  const serialized = JSON.stringify({ ...published, periodKey: keys.periodKey });
  await cache.put(keys.exact, serialized, { expirationTtl: 2 * 24 * 60 * 60 });
  // Never expire the last success for an unchanged public policy and period.
  await cache.put(keys.latest, serialized);
  await cache.put(
    `${keys.latest}:status`,
    JSON.stringify({
      version: published.version,
      contentHash: keys.contentHash,
      scopeHash: keys.scopeHash,
      periodKey: keys.periodKey,
      capturedAt: published.capturedAt
    })
  );
}
