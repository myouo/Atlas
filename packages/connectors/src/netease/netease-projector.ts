import { ProjectionError } from "@nivalis/domain";
import type {
  BuiltWidgetProjection,
  JsonObject,
  NormalizedProviderData,
  ProjectionTarget,
  ProviderProjector
} from "@nivalis/domain";

import { isNeteaseNormalizedPayload } from "./netease-normalizer";
import { NETEASE_SOURCE, type NeteaseNormalizedPayload } from "./netease-types";

export class NeteaseProjector implements ProviderProjector {
  readonly provider = "netease" as const;

  async project(
    normalized: NormalizedProviderData,
    targets: readonly ProjectionTarget[]
  ): Promise<readonly BuiltWidgetProjection[]> {
    await Promise.resolve();
    if (!isNeteaseNormalizedPayload(normalized.payload)) {
      throw new ProjectionError("Normalized NetEase payload is invalid.");
    }
    const payload = normalized.payload as NeteaseNormalizedPayload;
    const sourceSnapshotId =
      normalized.sourceSnapshotIds[NETEASE_SOURCE.weeklyRecord] ??
      normalized.sourceSnapshotIds[NETEASE_SOURCE.account];
    if (!sourceSnapshotId) throw new ProjectionError("NetEase source snapshot is missing.");
    return targets.map((target) => {
      if (target.type === "music.netease.overview" && target.schemaVersion === 2) {
        return built(target, overview(payload, target.dataConfig), 2, sourceSnapshotId);
      }
      if (target.type === "music.netease.ranking" && target.schemaVersion === 2) {
        return built(target, rankingV2(payload, target.dataConfig), 2, sourceSnapshotId);
      }
      if (target.type === "music.netease.showcase" && target.schemaVersion === 2) {
        return built(target, showcaseGallery(payload, target.dataConfig), 2, sourceSnapshotId);
      }
      if (target.schemaVersion !== 1) throw unsupported();
      switch (target.type) {
        case "music.netease.identity":
          return built(target, identity(payload, target.dataConfig), 1, sourceSnapshotId);
        case "music.netease.listening":
          return built(target, listening(payload, target.dataConfig), 1, sourceSnapshotId);
        case "music.netease.ranking":
          return built(target, ranking(payload, target.dataConfig), 1, sourceSnapshotId);
        case "music.netease.social":
          return built(target, social(payload, target.dataConfig), 1, sourceSnapshotId);
        case "music.netease.playlists":
          return built(target, playlists(payload, target.dataConfig), 1, sourceSnapshotId);
        case "music.netease.showcase":
          return built(target, showcase(payload, target.dataConfig), 1, sourceSnapshotId);
        default:
          throw unsupported();
      }
    });
  }
}

function built(
  target: ProjectionTarget,
  data: JsonObject,
  projectionSchemaVersion: number,
  sourceSnapshotId: string
): BuiltWidgetProjection {
  return {
    data,
    projectionKey: target.projectionKey,
    projectionSchemaVersion,
    sourceSnapshotId,
    widgetId: target.id
  };
}

function unsupported() {
  return new ProjectionError("NetEase target schema is unsupported.");
}

const IDENTITY_FIELDS = [
  "display_name",
  "avatar",
  "avatar_decoration",
  "signature",
  "level",
  "vip",
  "following_count",
  "follower_count",
  "playlist_count",
  "event_count",
  "medals",
  "social_status",
  "provider_user_id"
] as const;

function identity(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const fields = publicFields(dataConfig, IDENTITY_FIELDS, [
    "display_name",
    "avatar",
    "avatar_decoration",
    "level",
    "vip",
    "following_count",
    "follower_count",
    "playlist_count",
    "medals",
    "social_status"
  ]);
  const has = (field: (typeof IDENTITY_FIELDS)[number]) => fields.includes(field);
  const medalLimit = boundedInteger(dataConfig.medalLimit, 3, 0, 12);
  const activeMemberships = payload.memberships.filter((membership) => membership.active);
  return {
    provider: "netease",
    publicFields: fields,
    profile: {
      availability: "available",
      ...(has("display_name") ? { displayName: payload.account.displayName } : {}),
      ...(has("avatar") ? { avatarUrl: payload.account.avatarUrl } : {}),
      ...(has("avatar_decoration") ? { avatarDecorationUrl: payload.account.avatarFrameUrl } : {}),
      ...(has("signature") ? { signature: payload.account.signature } : {}),
      ...(has("level") ? { level: payload.account.level } : {}),
      ...(has("following_count") ? { followingCount: payload.account.followingCount } : {}),
      ...(has("follower_count") ? { followerCount: payload.account.followerCount } : {}),
      ...(has("playlist_count") ? { playlistCount: payload.account.playlistCount } : {}),
      ...(has("event_count") ? { eventCount: payload.account.eventCount } : {}),
      ...(has("provider_user_id") ? { providerUserId: payload.account.providerUserId } : {})
    },
    vip: has("vip")
      ? {
          active: activeMemberships.length > 0 || (payload.account.vipType ?? 0) > 0,
          availability: "available",
          memberships: activeMemberships.map((membership) => ({
            kind: membership.kind,
            level: membership.level,
            vipCode: membership.vipCode
          })),
          redVipAnnualCount: payload.redVipAnnualCount,
          redVipLevel: payload.redVipLevel
        }
      : { availability: "unavailable", reason: "not_public" },
    medals: has("medals")
      ? {
          availability: "available",
          items: payload.medals.items.slice(0, medalLimit).map((medal) => ({
            description: medal.description,
            iconUrl: medal.iconUrl,
            level: medal.level,
            name: medal.name,
            providerMedalCode: medal.providerMedalCode,
            worn: medal.worn
          })),
          obtainedCount: payload.medals.obtainedCount
        }
      : { availability: "unavailable", reason: "not_public" },
    socialStatus:
      has("social_status") && payload.socialStatus
        ? { availability: "available", ...payload.socialStatus }
        : {
            availability: "unavailable",
            reason: has("social_status") ? "provider_omitted" : "not_public"
          }
  };
}

const LISTENING_FIELDS = ["total_count", "total_duration", "weekly_duration", "trend"] as const;

function listening(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const fields = publicFields(dataConfig, LISTENING_FIELDS, [...LISTENING_FIELDS]);
  const has = (field: (typeof LISTENING_FIELDS)[number]) => fields.includes(field);
  return {
    provider: "netease",
    publicFields: fields,
    totalListenCount: has("total_count")
      ? metric(payload.totalListenCount, "plays", "all_time")
      : { availability: "unavailable", reason: "not_public" },
    totalListeningDuration: has("total_duration")
      ? metric(payload.listeningDurationTotalSeconds, "seconds", "all_time")
      : { availability: "unavailable", reason: "not_public" },
    weeklyListeningDuration: has("weekly_duration")
      ? metric(payload.listeningDurationMinutes, "minutes", "provider_week")
      : { availability: "unavailable", reason: "not_public" },
    trend: has("trend")
      ? payload.reportPoints.length > 0
        ? {
            availability: "available",
            coverage: "provider_report",
            points: payload.reportPoints,
            provenance: "provider_reported"
          }
        : { availability: "unavailable", reason: "provider_omitted" }
      : { availability: "unavailable", reason: "not_public" }
  };
}

function ranking(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const range = dataConfig.range === "all_time" ? "all_time" : "week";
  const records = range === "all_time" ? payload.allTimeRecords : payload.weeklyRecords;
  const limit = boundedInteger(dataConfig.publicLimit, 10, 1, 50);
  return {
    availability: "available",
    coverage: "provider_top_100",
    items: records.slice(0, limit).map((record, index) => ({
      playCount: record.playCount,
      rank: index + 1,
      score: record.score,
      track: trackSummary(record.track)
    })),
    provider: "netease",
    publicLimit: limit,
    range,
    totalAvailable: records.length
  };
}

function rankingV2(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const ranges = rankingRanges(dataConfig.publicRanges);
  const limit = boundedInteger(dataConfig.publicLimit, 12, 1, 30);
  return {
    allTime: ranges.includes("all_time")
      ? rankingRange(payload.allTimeRecords, limit)
      : { availability: "unavailable", reason: "not_public" },
    provider: "netease",
    publicLimit: limit,
    publicRanges: ranges,
    week: ranges.includes("week")
      ? rankingRange(payload.weeklyRecords, limit)
      : { availability: "unavailable", reason: "not_public" }
  };
}

function rankingRange(records: NeteaseNormalizedPayload["weeklyRecords"], limit: number) {
  return {
    availability: "available",
    coverage: "provider_top_100",
    items: records.slice(0, limit).map((record, index) => ({
      playCount: record.playCount,
      rank: index + 1,
      score: record.score,
      track: trackSummary(record.track)
    })),
    totalAvailable: records.length
  };
}

function rankingRanges(value: unknown): readonly ("week" | "all_time")[] {
  if (!Array.isArray(value)) return ["week", "all_time"];
  const ranges = [
    ...new Set(
      value.filter((item): item is "week" | "all_time" => item === "week" || item === "all_time")
    )
  ];
  return ranges.length > 0 ? ranges : ["week", "all_time"];
}

function social(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const lists = publicFields(dataConfig, ["following", "followers"] as const, []);
  const limit = boundedInteger(dataConfig.publicLimit, 8, 0, 30);
  return {
    followerCount: payload.account.followerCount,
    followers: lists.includes("followers")
      ? people(payload.followers.items.slice(0, limit), payload.followers.complete)
      : { availability: "unavailable", reason: "not_public" },
    following: lists.includes("following")
      ? people(payload.following.items.slice(0, limit), payload.following.complete)
      : { availability: "unavailable", reason: "not_public" },
    followingCount: payload.account.followingCount,
    provider: "netease",
    publicLists: lists,
    publicLimit: limit
  };
}

function playlists(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const limit = boundedInteger(dataConfig.publicLimit, 6, 0, 20);
  return {
    availability: "available",
    complete: payload.createdPlaylists.complete,
    items: payload.createdPlaylists.items.slice(0, limit).map(playlistSummary),
    provider: "netease",
    providerTotal: payload.createdPlaylists.providerTotal,
    publicLimit: limit
  };
}

function showcase(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const source = parseShowcaseSource(dataConfig.source) ?? "all_time_track";
  const resourceId = typeof dataConfig.resourceId === "string" ? dataConfig.resourceId : null;
  const card = selectShowcase(payload, source, resourceId);
  return card
    ? { availability: "available", card, provider: "netease", source }
    : { availability: "unavailable", provider: "netease", reason: "resource_not_found", source };
}

function showcaseGallery(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const selections = gallerySelections(dataConfig.selections);
  const mode =
    dataConfig.mode === "custom" || (dataConfig.mode !== "provider" && selections.length > 0)
      ? "custom"
      : "provider";
  if (mode === "provider") {
    return {
      availability: payload.musicCardsAvailable ? "available" : "unavailable",
      items: payload.musicCards.slice(0, 6).map((card) => ({
        card: { ...card, kind: "provider_music_card" },
        resourceId: card.providerCardId,
        source: "provider_music_card"
      })),
      maxItems: 6,
      mode,
      provider: "netease",
      ...(payload.musicCardsAvailable ? {} : { reason: "provider_omitted" })
    };
  }
  return {
    availability: "available",
    items: selections.flatMap((selection) => {
      const card = selectShowcase(payload, selection.source, selection.resourceId);
      return card ? [{ ...selection, card }] : [];
    }),
    maxItems: 6,
    mode,
    provider: "netease"
  };
}

function gallerySelections(value: unknown) {
  if (!Array.isArray(value)) return [];
  const selections = new Map<
    string,
    { readonly resourceId: string; readonly source: ShowcaseSource }
  >();
  for (const candidate of value) {
    if (!isObject(candidate) || typeof candidate.resourceId !== "string") continue;
    const source = parseShowcaseSource(candidate.source);
    if (!source) continue;
    const key = `${source}:${candidate.resourceId}`;
    if (!selections.has(key)) selections.set(key, { resourceId: candidate.resourceId, source });
    if (selections.size === 6) break;
  }
  return [...selections.values()];
}

function selectShowcase(
  payload: NeteaseNormalizedPayload,
  source: ShowcaseSource,
  resourceId: string | null
): JsonObject | null {
  if (source === "created_playlist") {
    const item = selectById(payload.createdPlaylists.items, resourceId, "providerPlaylistId");
    return item ? { kind: "playlist", ...playlistSummary(item) } : null;
  }
  if (source === "medal") {
    const item = selectById(payload.medals.items, resourceId, "providerMedalCode");
    return item
      ? {
          description: item.description,
          iconUrl: item.iconUrl,
          kind: "medal",
          level: item.level,
          name: item.name,
          providerMedalCode: item.providerMedalCode,
          worn: item.worn
        }
      : null;
  }
  if (source === "provider_music_card") {
    const item = selectById(payload.musicCards, resourceId, "providerCardId");
    return item ? { ...item, kind: "provider_music_card" } : null;
  }
  if (source === "listening_duration") {
    return payload.listeningDurationTotalSeconds === null
      ? null
      : {
          kind: "duration",
          label: "累计播放时间",
          provenance: "provider_reported",
          unit: "seconds",
          value: payload.listeningDurationTotalSeconds
        };
  }
  const records = source === "weekly_track" ? payload.weeklyRecords : payload.allTimeRecords;
  const item = resourceId
    ? records.find((record) => record.track.providerTrackId === resourceId)
    : records[0];
  return item
    ? {
        kind: "track",
        playCount: item.playCount,
        score: item.score,
        track: trackSummary(item.track)
      }
    : null;
}

type ShowcaseSource =
  | "weekly_track"
  | "all_time_track"
  | "created_playlist"
  | "medal"
  | "listening_duration"
  | "provider_music_card";

function parseShowcaseSource(value: unknown): ShowcaseSource | null {
  return [
    "weekly_track",
    "all_time_track",
    "created_playlist",
    "medal",
    "listening_duration",
    "provider_music_card"
  ].includes(typeof value === "string" ? value : "")
    ? (value as ShowcaseSource)
    : null;
}

function publicFields<T extends string>(
  config: JsonObject,
  allowed: readonly T[],
  defaults: readonly T[]
): readonly T[] {
  if (!Array.isArray(config.publicFields) && !Array.isArray(config.publicLists)) return defaults;
  const input = (
    Array.isArray(config.publicFields) ? config.publicFields : config.publicLists
  ) as readonly unknown[];
  return [
    ...new Set(
      input.filter((value): value is T => typeof value === "string" && allowed.includes(value as T))
    )
  ];
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function metric(value: number | null, unit: string, period: string): JsonObject {
  return value === null
    ? { availability: "unavailable", reason: "provider_omitted" }
    : { availability: "available", period, provenance: "provider_reported", unit, value };
}

function people(
  items: NeteaseNormalizedPayload["following"]["items"],
  complete: boolean
): JsonObject {
  return {
    availability: "available",
    complete,
    items: items.map((item) => ({
      avatarDecorationUrl: item.avatarFrameUrl,
      avatarUrl: item.avatarUrl,
      displayName: item.displayName,
      providerUserId: item.providerUserId,
      signature: item.signature,
      vipType: item.vipType
    }))
  };
}

function playlistSummary(item: NeteaseNormalizedPayload["createdPlaylists"]["items"][number]) {
  return {
    coverUrl: item.coverUrl,
    name: item.name,
    playCount: item.playCount,
    providerPlaylistId: item.providerPlaylistId,
    subscribedCount: item.subscribedCount,
    tags: item.tags,
    trackCount: item.trackCount
  };
}

function selectById<T, K extends keyof T>(items: readonly T[], id: string | null, key: K) {
  return id ? items.find((item) => String(item[key]) === id) : items[0];
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function buildNeteaseOwnerDataCatalog(payload: NeteaseNormalizedPayload): JsonObject {
  return {
    account: payload.account,
    allTimeRanking: payload.allTimeRecords.map((record, index) => ({
      playCount: record.playCount,
      rank: index + 1,
      score: record.score,
      track: trackSummary(record.track)
    })),
    createdPlaylists: payload.createdPlaylists,
    followers: payload.followers,
    following: payload.following,
    levelProgress: payload.levelProgress,
    listening: {
      totalDurationSeconds: payload.listeningDurationTotalSeconds,
      totalListenCount: payload.totalListenCount,
      weeklyDurationMinutes: payload.listeningDurationMinutes,
      weeklyTrend: payload.reportPoints
    },
    medals: payload.medals,
    memberships: payload.memberships,
    musicCards: {
      items: payload.musicCards,
      sourceAvailability: payload.musicCardsAvailable ? "available" : "provider_omitted"
    },
    provider: "netease",
    redVipAnnualCount: payload.redVipAnnualCount,
    redVipLevel: payload.redVipLevel,
    recentListening: payload.recentListens.map((item) => ({
      playedAt: item.playedAt,
      track: trackSummary(item.track)
    })),
    schemaVersion: 1,
    socialStatus: payload.socialStatus,
    weeklyRanking: payload.weeklyRecords.map((record, index) => ({
      playCount: record.playCount,
      rank: index + 1,
      score: record.score,
      track: trackSummary(record.track)
    }))
  };
}

function overview(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const unavailable = (reason: string) => ({ availability: "unavailable", reason });
  const range = dataConfig.range === "7d" ? "7d" : null;
  const artistCounts = new Map<string, { name: string; plays: number }>();
  for (const record of payload.weeklyRecords) {
    for (const artist of record.track.artists) {
      const current = artistCounts.get(artist.providerArtistId);
      artistCounts.set(artist.providerArtistId, {
        name: artist.name,
        plays: (current?.plays ?? 0) + record.playCount
      });
    }
  }
  return {
    account: {
      availability: "available",
      displayName: payload.account.displayName,
      providerUserId: payload.account.providerUserId
    },
    listeningDuration:
      payload.listeningDurationMinutes === null
        ? unavailable("provider_omitted")
        : {
            availability: "available",
            provenance: "provider_reported",
            unit: "minutes",
            value: payload.listeningDurationMinutes
          },
    provider: "netease",
    recentListening: {
      availability: "available",
      coverage: "provider_recent_limit",
      items: payload.recentListens.slice(0, 100).map((item) => ({
        playedAt: item.playedAt,
        track: trackSummary(item.track)
      })),
      provenance: "provider_reported"
    },
    totalListenCount: {
      availability: "available",
      provenance: "provider_reported",
      unit: "plays",
      value: payload.totalListenCount
    },
    trend:
      payload.reportPoints.length === 0
        ? unavailable("provider_omitted")
        : {
            availability: "available",
            coverage: "provider_report",
            points: payload.reportPoints,
            provenance: "provider_reported"
          },
    weeklyListening:
      range === null
        ? unavailable("insufficient_coverage")
        : {
            availability: "available",
            coverage: "top_records",
            period: "provider_week",
            provenance: "nivalis_derived",
            rankedPlayCount: payload.weeklyRecords.reduce(
              (total, record) => total + record.playCount,
              0
            ),
            topArtists: [...artistCounts.entries()]
              .sort((left, right) => right[1].plays - left[1].plays)
              .slice(0, 20)
              .map(([providerArtistId, artist]) => ({
                name: artist.name,
                providerArtistId,
                rankedPlayCount: artist.plays
              })),
            topTracks: payload.weeklyRecords.slice(0, 100).map((record) => ({
              playCount: record.playCount,
              score: record.score,
              track: trackSummary(record.track)
            }))
          }
  };
}

function trackSummary(track: NeteaseNormalizedPayload["weeklyRecords"][number]["track"]) {
  return {
    albumName: track.albumName,
    artists: track.artists,
    coverUrl: track.coverUrl,
    durationMs: track.durationMs,
    name: track.name,
    providerTrackId: track.providerTrackId
  };
}
