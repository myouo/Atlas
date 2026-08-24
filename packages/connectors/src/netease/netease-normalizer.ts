import { ProviderSchemaMismatchError } from "@nivalis/domain";
import type {
  JsonObject,
  NormalizedProviderData,
  ProviderNormalizer,
  RawSnapshot
} from "@nivalis/domain";
import Value from "typebox/value";
import type { Static, TSchema } from "typebox";

import {
  NeteaseAccountResponseSchema,
  NeteaseAllTimeRecordResponseSchema,
  NeteaseCreatedPlaylistsResponseSchema,
  NeteaseFollowersResponseSchema,
  NeteaseFollowingResponseSchema,
  NeteaseListenTotalResponseSchema,
  NeteaseListenReportResponseSchema,
  NeteaseMedalsResponseSchema,
  NeteaseProfileHomeResponseSchema,
  NeteaseRecentSongsResponseSchema,
  NeteaseSocialStatusResponseSchema,
  NeteaseUserDetailResponseSchema,
  NeteaseUserLevelResponseSchema,
  NeteaseVipInfoResponseSchema,
  NeteaseWeeklyRecordResponseSchema
} from "./schemas/provider-schemas";
import {
  NETEASE_SOURCE,
  type NeteaseNormalizedArtist,
  type NeteaseNormalizedMedal,
  type NeteaseNormalizedMembership,
  type NeteaseNormalizedMusicCard,
  type NeteaseNormalizedPayload,
  type NeteaseNormalizedPlaylist,
  type NeteaseNormalizedTrack
} from "./netease-types";

export class NeteaseNormalizer implements ProviderNormalizer {
  readonly provider = "netease" as const;

  async normalize(snapshots: readonly RawSnapshot[]): Promise<NormalizedProviderData> {
    await Promise.resolve();
    const accountSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.account);
    const allTimeSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.allTimeRecord);
    const playlistSnapshots = matchingSnapshots(snapshots, NETEASE_SOURCE.createdPlaylists);
    const detailSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.userDetail);
    const followerSnapshots = matchingSnapshots(snapshots, NETEASE_SOURCE.followers);
    const followingSnapshots = matchingSnapshots(snapshots, NETEASE_SOURCE.following);
    const listenTotalSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.listenTotal);
    const medalsSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.medals);
    const profileHomeSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.profileHome);
    const weeklySnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.weeklyRecord);
    const recentSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.recentSongs);
    const reportSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.listenReportWeek);
    const socialStatusSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.socialStatus);
    const levelSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.userLevel);
    const vipSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.vipInfo);

    const account = checked(NeteaseAccountResponseSchema, accountSnapshot);
    const allTime = checked(NeteaseAllTimeRecordResponseSchema, allTimeSnapshot);
    const playlistPages = playlistSnapshots.map((snapshot) =>
      checked(NeteaseCreatedPlaylistsResponseSchema, snapshot)
    );
    const detail = checked(NeteaseUserDetailResponseSchema, detailSnapshot);
    const followerPages = followerSnapshots.map((snapshot) =>
      checked(NeteaseFollowersResponseSchema, snapshot)
    );
    const followingPages = followingSnapshots.map((snapshot) =>
      checked(NeteaseFollowingResponseSchema, snapshot)
    );
    const listenTotal = checked(NeteaseListenTotalResponseSchema, listenTotalSnapshot);
    const medals = checked(NeteaseMedalsResponseSchema, medalsSnapshot);
    checked(NeteaseProfileHomeResponseSchema, profileHomeSnapshot);
    const weekly = checked(NeteaseWeeklyRecordResponseSchema, weeklySnapshot);
    const recent = checked(NeteaseRecentSongsResponseSchema, recentSnapshot);
    const report = checked(NeteaseListenReportResponseSchema, reportSnapshot);
    const socialStatus = checked(NeteaseSocialStatusResponseSchema, socialStatusSnapshot);
    const level = checked(NeteaseUserLevelResponseSchema, levelSnapshot);
    const vip = checked(NeteaseVipInfoResponseSchema, vipSnapshot);

    const distribution = report.data.listenTimeDistributionBlock;
    const providerUserId = String(account.profile?.userId ?? account.account.id);
    const profile = detail.profile;
    const playlistItems = uniqueBy(
      playlistPages.flatMap((page) => page.data.playlist),
      (item) => String(item.id)
    );
    const followerItems = uniqueBy(
      followerPages.flatMap((page) => page.followeds),
      (item) => String(item.userId)
    );
    const followingItems = uniqueBy(
      followingPages.flatMap((page) => page.follow),
      (item) => String(item.userId)
    );
    const firstPlaylistPage = playlistPages[0]!;
    const lastPlaylistPage = playlistPages.at(-1)!;
    const lastFollowerPage = followerPages.at(-1)!;
    const lastFollowingPage = followingPages.at(-1)!;
    const playlistTotal = firstPlaylistPage.data.count ?? null;
    const followerTotal = profile.followeds ?? followerPages[0]!.size ?? null;
    const followingTotal = profile.follows ?? null;
    const payload: NeteaseNormalizedPayload = {
      account: {
        avatarFrameUrl: safeArtworkUrl(profile.avatarDetail?.identityIconUrl),
        avatarUrl: safeArtworkUrl(profile.avatarUrl),
        createdAt: timestamp(profile.createTime),
        displayName: account.profile?.nickname ?? null,
        eventCount: profile.eventCount ?? 0,
        followerCount: profile.followeds ?? followerPages[0]!.size ?? followerItems.length,
        followingCount: profile.follows ?? followingItems.length,
        level: level.data.level ?? detail.level ?? null,
        playlistCount:
          profile.playlistCount ?? firstPlaylistPage.data.count ?? playlistItems.length,
        providerUserId,
        signature: nonEmpty(profile.signature),
        vipType: profile.vipType ?? null
      },
      allTimeRecords: allTime.allData.map(normalizeRecord),
      createdPlaylists: {
        complete:
          lastPlaylistPage.data.more !== true ||
          (playlistTotal !== null && playlistItems.length >= playlistTotal),
        items: playlistItems
          .filter(
            (playlist) =>
              playlist.userId === undefined || String(playlist.userId) === providerUserId
          )
          .map(normalizePlaylist),
        providerTotal: playlistTotal
      },
      followers: {
        complete:
          lastFollowerPage.more !== true ||
          (followerTotal !== null && followerItems.length >= followerTotal),
        items: followerItems.map(normalizeUserSummary),
        providerTotal: followerTotal
      },
      following: {
        complete:
          lastFollowingPage.more !== true ||
          (followingTotal !== null && followingItems.length >= followingTotal),
        items: followingItems.map(normalizeUserSummary),
        providerTotal: followingTotal
      },
      levelProgress: {
        currentLoginCount: level.data.nowLoginCount ?? null,
        currentPlayCount: level.data.nowPlayCount ?? null,
        nextLoginCount: level.data.nextLoginCount ?? null,
        nextPlayCount: level.data.nextPlayCount ?? null,
        progress: level.data.progress ?? null
      },
      listeningDurationMinutes:
        distribution?.playDuration ??
        (report.data.duration === undefined ? null : report.data.duration / 60),
      listeningDurationTotalSeconds: listenTotal.data.totalDuration,
      medals: {
        items: (medals.data.obtainMedals ?? []).map(normalizeMedal),
        obtainedCount: medals.data.medalNum ?? medals.data.obtainMedals?.length ?? 0
      },
      memberships: memberships(vip.data),
      musicCards: normalizeMusicCards(profileHomeSnapshot.payload),
      recentListens: recent.data.list.slice(0, 100).map((item) => ({
        playedAt: new Date(item.playTime).toISOString(),
        track: normalizeTrack("data" in item ? item.data : item.resource)
      })),
      redVipAnnualCount:
        vip.data.redVipAnnualCount === undefined || vip.data.redVipAnnualCount < 0
          ? null
          : vip.data.redVipAnnualCount,
      redVipLevel: vip.data.redVipLevel ?? null,
      reportPoints:
        distribution?.durationDetails?.map((point) => ({
          label: point.period,
          minutes: point.duration
        })) ??
        (report.data.points ?? []).map((point) => ({
          label: point.label,
          minutes: point.duration / 60
        })),
      socialStatus: normalizeSocialStatus(socialStatus.data as JsonObject),
      totalListenCount: detail.listenSongs,
      weeklyRecords: weekly.weekData.map(normalizeRecord)
    };

    return {
      payload,
      provider: "netease",
      schemaVersion: 1,
      sourceSnapshotIds: Object.fromEntries(
        snapshots.map((snapshot) => [snapshot.sourceKind, snapshot.id])
      )
    };
  }
}

function normalizeRecord(item: {
  readonly playCount: number;
  readonly score: number;
  readonly song: Parameters<typeof normalizeTrack>[0];
}) {
  return { playCount: item.playCount, score: item.score, track: normalizeTrack(item.song) };
}

function normalizeUserSummary(user: {
  readonly avatarDetail?: { readonly identityIconUrl?: string } | null;
  readonly avatarUrl?: string;
  readonly nickname: string;
  readonly signature?: string | null;
  readonly userId: number | string;
  readonly vipType?: number;
}) {
  return {
    avatarFrameUrl: safeArtworkUrl(user.avatarDetail?.identityIconUrl),
    avatarUrl: safeArtworkUrl(user.avatarUrl),
    displayName: user.nickname,
    providerUserId: String(user.userId),
    signature: nonEmpty(user.signature),
    vipType: user.vipType ?? null
  };
}

function normalizePlaylist(playlist: {
  readonly coverImgUrl?: string;
  readonly createTime?: number;
  readonly description?: string | null;
  readonly id: number | string;
  readonly name: string;
  readonly playCount?: number;
  readonly subscribedCount?: number;
  readonly tags?: readonly string[];
  readonly totalDuration?: number;
  readonly trackCount?: number;
}): NeteaseNormalizedPlaylist {
  return {
    coverUrl: safeArtworkUrl(playlist.coverImgUrl),
    createdAt: timestamp(playlist.createTime),
    description: nonEmpty(playlist.description),
    name: playlist.name,
    playCount: playlist.playCount ?? 0,
    providerPlaylistId: String(playlist.id),
    subscribedCount: playlist.subscribedCount ?? 0,
    tags: playlist.tags ?? [],
    totalDurationMs: playlist.totalDuration ?? null,
    trackCount: playlist.trackCount ?? 0
  };
}

function normalizeMedal(medal: {
  readonly descriptionText?: string | null;
  readonly medalCode: string;
  readonly medalLevel?: number | null;
  readonly medalName: string;
  readonly medalPicUrl?: string;
  readonly obtainTime?: number | null;
  readonly wear?: boolean;
}): NeteaseNormalizedMedal {
  return {
    description: nonEmpty(medal.descriptionText),
    iconUrl: safeArtworkUrl(medal.medalPicUrl),
    level: medal.medalLevel ?? null,
    name: medal.medalName,
    obtainedAt: timestamp(medal.obtainTime ?? undefined),
    providerMedalCode: medal.medalCode,
    worn: medal.wear ?? false
  };
}

function memberships(data: {
  readonly albumVip?: MembershipInput | null;
  readonly associator?: MembershipInput | null;
  readonly musicPackage?: MembershipInput | null;
  readonly now?: number;
  readonly redplus?: MembershipInput | null;
  readonly voiceBookVip?: MembershipInput | null;
}): readonly NeteaseNormalizedMembership[] {
  const now = data.now ?? Date.now();
  return (
    [
      ["associator", data.associator],
      ["music_package", data.musicPackage],
      ["red_plus", data.redplus],
      ["voice_book", data.voiceBookVip],
      ["album", data.albumVip]
    ] as const
  )
    .filter((entry): entry is readonly [NeteaseNormalizedMembership["kind"], MembershipInput] =>
      Boolean(entry[1])
    )
    .map(([kind, membership]) => ({
      active:
        membership.expireTime === undefined
          ? (membership.vipCode ?? 0) > 0
          : membership.expireTime > now,
      expiresAt: timestamp(membership.expireTime),
      kind,
      level: membership.vipLevel ?? null,
      vipCode: membership.vipCode ?? null
    }));
}

interface MembershipInput {
  readonly expireTime?: number;
  readonly vipCode?: number;
  readonly vipLevel?: number;
}

function normalizeSocialStatus(data: JsonObject) {
  const id = stringOrNumber(data.id ?? data.statusId);
  const name = nonEmpty(data.name) ?? nonEmpty(data.title) ?? nonEmpty(data.text);
  if (!id || !name) return null;
  return {
    iconUrl: safeArtworkUrl(stringValue(data.iconUrl ?? data.icon)),
    name,
    providerStatusId: id
  };
}

function normalizeMusicCards(payload: unknown): readonly NeteaseNormalizedMusicCard[] {
  if (!isObject(payload)) return [];
  const data = isObject(payload.data) ? payload.data : null;
  const cards = data && Array.isArray(data.musicCards) ? data.musicCards : [];
  return cards.flatMap((candidate, index) => {
    if (!isObject(candidate)) return [];
    const resource = isObject(candidate.resource) ? candidate.resource : null;
    const title = nonEmpty(candidate.title) ?? nonEmpty(resource?.name);
    if (!title) return [];
    const rawKind = stringValue(candidate.cardType ?? candidate.type);
    const cardKind = ["album", "duration", "medal", "playlist", "song"].includes(rawKind ?? "")
      ? (rawKind as NeteaseNormalizedMusicCard["cardKind"])
      : "unknown";
    return [
      {
        cardKind,
        coverUrl: safeArtworkUrl(stringValue(candidate.coverUrl ?? resource?.picUrl)),
        description: nonEmpty(candidate.description ?? candidate.subtitle),
        providerCardId: stringOrNumber(candidate.cardId ?? candidate.id) ?? `position-${index}`,
        resourceId: stringOrNumber(candidate.resourceId ?? resource?.id),
        title
      }
    ];
  });
}

function requiredSnapshot(snapshots: readonly RawSnapshot[], sourceKind: string) {
  const snapshot = snapshots.find((candidate) => candidate.sourceKind === sourceKind);
  if (!snapshot) throw new ProviderSchemaMismatchError(sourceKind);
  return snapshot;
}

function matchingSnapshots(snapshots: readonly RawSnapshot[], sourceKind: string) {
  const matches = snapshots.filter(
    (candidate) =>
      candidate.sourceKind === sourceKind || candidate.sourceKind.startsWith(`${sourceKind}.page.`)
  );
  if (matches.length === 0) throw new ProviderSchemaMismatchError(sourceKind);
  return matches;
}

function uniqueBy<T>(items: readonly T[], identity: (item: T) => string) {
  const unique = new Map<string, T>();
  for (const item of items) unique.set(identity(item), item);
  return [...unique.values()];
}

function checked<T extends TSchema>(schema: T, snapshot: RawSnapshot): Static<T> {
  if (!Value.Check(schema, snapshot.payload)) {
    throw new ProviderSchemaMismatchError(snapshot.sourceKind);
  }
  return snapshot.payload as Static<T>;
}

function normalizeTrack(track: {
  readonly al?: { readonly id?: number | string; readonly name?: string; readonly picUrl?: string };
  readonly ar: readonly { readonly id: number | string; readonly name: string }[];
  readonly dt?: number;
  readonly id: number | string;
  readonly name: string;
}): NeteaseNormalizedTrack {
  return {
    albumName: track.al?.name ?? null,
    albumProviderId: track.al?.id === undefined ? null : String(track.al.id),
    artists: track.ar.map((artist): NeteaseNormalizedArtist => ({
      name: artist.name,
      providerArtistId: String(artist.id)
    })),
    coverUrl: safeArtworkUrl(track.al?.picUrl),
    durationMs: track.dt ?? null,
    name: track.name,
    providerTrackId: String(track.id)
  };
}

function safeArtworkUrl(value: string | undefined | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function timestamp(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringOrNumber(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNeteaseNormalizedPayload(value: JsonObject): value is NeteaseNormalizedPayload {
  return (
    typeof value.totalListenCount === "number" &&
    Array.isArray(value.weeklyRecords) &&
    Array.isArray(value.allTimeRecords) &&
    Array.isArray(value.recentListens) &&
    Array.isArray(value.reportPoints) &&
    Array.isArray(value.memberships) &&
    Array.isArray(value.musicCards) &&
    value.account !== null &&
    typeof value.account === "object"
  );
}
