import type { WidgetProjection, WidgetType } from "@nivalis/api-client";

export type WidgetOf<TType extends WidgetType> = Extract<WidgetProjection, { type: TType }>;

export interface UnknownWidgetProjection {
  readonly id: string;
  readonly schemaVersion: number;
  readonly stale: boolean;
  readonly title: string;
  readonly type: string;
  readonly updatedAt: string;
  readonly data: unknown;
}

export type RuntimeWidgetProjection = WidgetProjection | UnknownWidgetProjection;

export function isKnownWidget(widget: RuntimeWidgetProjection): widget is WidgetProjection {
  return [
    "profile.hero",
    "system.stats",
    "music.netease.overview",
    "music.netease.identity",
    "music.netease.listening",
    "music.netease.calendar",
    "music.netease.ranking",
    "music.netease.social",
    "music.netease.playlists",
    "music.netease.showcase",
    "github.profile",
    "bilibili.profile",
    "steam.profile",
    "bangumi.collection"
  ].includes(widget.type);
}
