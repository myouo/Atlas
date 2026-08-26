import type { JsonObject } from "@nivalis/domain";

export const NETEASE_SOURCE = {
  account: "netease.account",
  allTimeRecord: "netease.all_time_record",
  createdPlaylists: "netease.created_playlists",
  followers: "netease.followers",
  following: "netease.following",
  listenTotal: "netease.listen_total",
  listenReportWeek: "netease.listen_report.week",
  medals: "netease.medals",
  musicCardTracks: "netease.music_card_tracks",
  profileHome: "netease.profile_home",
  profileMusicCards: "netease.profile_music_cards",
  profileShowcase: "netease.profile_showcase",
  recentSongs: "netease.recent_songs",
  socialStatus: "netease.social_status",
  userDetail: "netease.user_detail",
  userLevel: "netease.user_level",
  vipInfo: "netease.vip_info",
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

export interface NeteaseNormalizedUserSummary extends JsonObject {
  readonly avatarFrameUrl: string | null;
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly providerUserId: string;
  readonly signature: string | null;
  readonly vipType: number | null;
}

export interface NeteaseNormalizedPlaylist extends JsonObject {
  readonly coverUrl: string | null;
  readonly createdAt: string | null;
  readonly description: string | null;
  readonly name: string;
  readonly playCount: number;
  readonly providerPlaylistId: string;
  readonly subscribedCount: number;
  readonly tags: readonly string[];
  readonly totalDurationMs: number | null;
  readonly trackCount: number;
}

export interface NeteaseNormalizedMedal extends JsonObject {
  readonly description: string | null;
  readonly iconUrl: string | null;
  readonly level: number | null;
  readonly name: string;
  readonly obtainedAt: string | null;
  readonly providerMedalCode: string;
  readonly worn: boolean;
}

export interface NeteaseNormalizedMembership extends JsonObject {
  readonly active: boolean;
  readonly expiresAt: string | null;
  readonly kind: "associator" | "music_package" | "red_plus" | "voice_book" | "album";
  readonly level: number | null;
  readonly vipCode: number | null;
}

export interface NeteaseNormalizedMusicCard extends JsonObject {
  readonly artists: readonly NeteaseNormalizedArtist[];
  readonly cardKind:
    "album" | "duration" | "favorite" | "medal" | "playlist" | "ranking" | "song" | "unknown";
  readonly badgeIconUrl: string | null;
  readonly badgeText: string | null;
  readonly coverUrl: string | null;
  readonly creativeType: string;
  readonly description: string | null;
  readonly imageUrls: readonly string[];
  readonly jumpUrl: string | null;
  readonly providerCardId: string;
  readonly providerPublic: boolean;
  readonly providerUiType: string | null;
  readonly providerVisibility: string | null;
  readonly resourceId: string | null;
  readonly resourceType: string | null;
  readonly sourceBlockCode: string | null;
  readonly sourceBlockType: string;
  readonly textLines: readonly string[];
  readonly title: string;
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
    readonly avatarFrameUrl: string | null;
    readonly avatarUrl: string | null;
    readonly createdAt: string | null;
    readonly displayName: string | null;
    readonly eventCount: number;
    readonly followerCount: number;
    readonly followingCount: number;
    readonly level: number | null;
    readonly playlistCount: number;
    readonly providerUserId: string;
    readonly signature: string | null;
    readonly vipType: number | null;
  };
  readonly allTimeRecords: readonly NeteaseWeeklyRecord[];
  readonly createdPlaylists: {
    readonly complete: boolean;
    readonly items: readonly NeteaseNormalizedPlaylist[];
    readonly providerTotal: number | null;
  };
  readonly followers: {
    readonly complete: boolean;
    readonly items: readonly NeteaseNormalizedUserSummary[];
    readonly providerTotal: number | null;
  };
  readonly following: {
    readonly complete: boolean;
    readonly items: readonly NeteaseNormalizedUserSummary[];
    readonly providerTotal: number | null;
  };
  readonly levelProgress: {
    readonly currentLoginCount: number | null;
    readonly currentPlayCount: number | null;
    readonly nextLoginCount: number | null;
    readonly nextPlayCount: number | null;
    readonly progress: number | null;
  };
  readonly listeningDurationMinutes: number | null;
  readonly listeningDurationTotalSeconds: number | null;
  readonly medals: {
    readonly obtainedCount: number;
    readonly items: readonly NeteaseNormalizedMedal[];
  };
  readonly memberships: readonly NeteaseNormalizedMembership[];
  readonly musicCards: readonly NeteaseNormalizedMusicCard[];
  readonly musicCardsAvailable: boolean;
  readonly recentListens: readonly NeteaseRecentListen[];
  readonly redVipAnnualCount: number | null;
  readonly redVipLevel: number | null;
  readonly reportPoints: readonly NeteaseReportPoint[];
  readonly socialStatus: {
    readonly iconUrl: string | null;
    readonly name: string;
    readonly providerStatusId: string;
  } | null;
  readonly totalListenCount: number;
  readonly weeklyRecords: readonly NeteaseWeeklyRecord[];
}
