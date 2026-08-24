import type { JsonObject } from "@nivalis/domain";

export const NETEASE_SOURCE = {
  account: "netease.account",
  listenReportWeek: "netease.listen_report.week",
  recentSongs: "netease.recent_songs",
  userDetail: "netease.user_detail",
  weeklyRecord: "netease.weekly_record"
} as const;

export type NeteaseSourceKind = (typeof NETEASE_SOURCE)[keyof typeof NETEASE_SOURCE];

export interface NeteaseNormalizedArtist extends JsonObject {
  readonly name: string;
  readonly providerArtistId: string;
}

export interface NeteaseNormalizedTrack extends JsonObject {
  readonly albumName: string | null;
  readonly albumProviderId: string | null;
  readonly artists: readonly NeteaseNormalizedArtist[];
  readonly coverUrl: string | null;
  readonly durationMs: number | null;
  readonly name: string;
  readonly providerTrackId: string;
}

export interface NeteaseWeeklyRecord extends JsonObject {
  readonly playCount: number;
  readonly score: number;
  readonly track: NeteaseNormalizedTrack;
}

export interface NeteaseRecentListen extends JsonObject {
  readonly playedAt: string;
  readonly track: NeteaseNormalizedTrack;
}

export interface NeteaseReportPoint extends JsonObject {
  readonly label: string;
  readonly minutes: number;
}

export interface NeteaseNormalizedPayload extends JsonObject {
  readonly account: {
    readonly displayName: string | null;
    readonly providerUserId: string;
  };
  readonly listeningDurationMinutes: number | null;
  readonly recentListens: readonly NeteaseRecentListen[];
  readonly reportPoints: readonly NeteaseReportPoint[];
  readonly totalListenCount: number;
  readonly weeklyRecords: readonly NeteaseWeeklyRecord[];
}
