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
  NeteaseProfileMusicCardsResponseSchema,
  NeteaseProfileShowcaseResponseSchema,
  NeteaseRecentSongsResponseSchema,
  NeteaseSongDetailResponseSchema,
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
    const profileMusicCardsSnapshot = snapshots.find(
      (snapshot) => snapshot.sourceKind === NETEASE_SOURCE.profileMusicCards
    );
    const musicCardTracksSnapshot = snapshots.find(
      (snapshot) => snapshot.sourceKind === NETEASE_SOURCE.musicCardTracks
    );
    const profileShowcaseSnapshots = optionalMatchingSnapshots(
      snapshots,
      NETEASE_SOURCE.profileShowcase
    );
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
    const profileMusicCards = profileMusicCardsSnapshot
      ? checked(NeteaseProfileMusicCardsResponseSchema, profileMusicCardsSnapshot)
      : null;
    const musicCardTracks = musicCardTracksSnapshot
      ? checked(NeteaseSongDetailResponseSchema, musicCardTracksSnapshot)
      : null;
    const profileShowcasePages = profileShowcaseSnapshots.map((snapshot) =>
      checked(NeteaseProfileShowcaseResponseSchema, snapshot)
    );
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
    const musicCards = profileMusicCards
      ? normalizeExhibitionMusicCards(
          profileMusicCards,
          musicCardTracks?.songs ?? [],
          providerUserId
        )
      : profileShowcasePages.length > 0
        ? normalizeProfileMusicCards(profileShowcasePages)
        : normalizeLegacyMusicCards(profileHomeSnapshot.payload);
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
      musicCards: musicCards.items,
      musicCardsAvailable: musicCards.available,
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

function normalizeExhibitionMusicCards(
  payload: Static<typeof NeteaseProfileMusicCardsResponseSchema>,
  tracks: Static<typeof NeteaseSongDetailResponseSchema>["songs"],
  providerUserId: string
): {
  readonly available: boolean;
  readonly items: readonly NeteaseNormalizedMusicCard[];
} {
  const tracksById = new Map(tracks.map((track) => [String(track.id), normalizeTrack(track)]));
  const items = payload.data.cardVOList.map((card) => {
    const coverUrl = safeArtworkUrl(card.cover);
    const track = tracksById.get(card.resId);
    return {
      artists: track?.artists ?? [],
      badgeIconUrl: null,
      badgeText: null,
      cardKind: exhibitionCardKind(card.resType),
      coverUrl,
      creativeType: "EXHIBITION_CARD",
      description: null,
      imageUrls: coverUrl ? [coverUrl] : [],
      jumpUrl: exhibitionWebUrl(card.resType, card.resId, providerUserId),
      providerCardId: String(card.id),
      providerPublic: payload.data.open,
      providerUiType: null,
      providerVisibility: null,
      resourceId: nonEmpty(card.resId),
      resourceType: card.resType,
      sourceBlockCode: "user.page.window",
      sourceBlockType: "EXHIBITION",
      textLines: [],
      title: card.name
    } satisfies NeteaseNormalizedMusicCard;
  });
  return {
    available: payload.data.open,
    items: uniqueBy(items, (card) => card.providerCardId)
  };
}

function exhibitionWebUrl(resourceType: string, resourceId: string, providerUserId: string) {
  const resourceRoutes: Readonly<Record<string, string>> = {
    album: "album",
    latest_collect_playlist: "playlist",
    latest_create_playlist: "playlist",
    latest_heart_song: "song",
    playlist: "playlist",
    song: "song"
  };
  const route = resourceRoutes[resourceType];
  const id = resourceType === "song_rank" ? providerUserId : resourceId;
  if (!/^\d+$/.test(id)) return null;
  const url = new URL(
    resourceType === "song_rank" ? "/user/songs/rank" : `/${route ?? ""}`,
    "https://music.163.com"
  );
  if (resourceType !== "song_rank" && !route) return null;
  url.searchParams.set("id", id);
  return url.toString();
}

function exhibitionCardKind(resType: string): NeteaseNormalizedMusicCard["cardKind"] {
  if (resType === "song" || resType === "latest_heart_song") return "song";
  if (
    resType === "playlist" ||
    resType === "latest_collect_playlist" ||
    resType === "latest_create_playlist"
  ) {
    return "playlist";
  }
  if (resType === "album") return "album";
  if (resType === "song_rank") return "ranking";
  if (resType === "today_listen") return "duration";
  if (resType === "latest_medal") return "medal";
  return "unknown";
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

function normalizeLegacyMusicCards(payload: unknown): {
  readonly available: boolean;
  readonly items: readonly NeteaseNormalizedMusicCard[];
} {
  if (!isObject(payload)) return { available: false, items: [] };
  const data = isObject(payload.data) ? payload.data : null;
  const cards = data && Array.isArray(data.musicCards) ? data.musicCards : [];
  return {
    available: Boolean(data && Array.isArray(data.musicCards)),
    items: cards.flatMap((candidate, index) => {
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
          artists: [],
          badgeIconUrl: null,
          badgeText: null,
          cardKind,
          coverUrl: safeArtworkUrl(stringValue(candidate.coverUrl ?? resource?.picUrl)),
          creativeType: "legacy",
          description: nonEmpty(candidate.description ?? candidate.subtitle),
          imageUrls: [],
          jumpUrl: null,
          providerCardId: stringOrNumber(candidate.cardId ?? candidate.id) ?? `position-${index}`,
          providerPublic: true,
          providerUiType: null,
          providerVisibility: null,
          resourceId: stringOrNumber(candidate.resourceId ?? resource?.id),
          resourceType: rawKind ?? null,
          sourceBlockCode: null,
          sourceBlockType: "legacy",
          textLines: [],
          title
        }
      ];
    })
  };
}

const profileShowcaseCreativeTypes = [
  "SHOWCASE_BUTTON",
  "SHOWCASE_GALLERY_FIX",
  "SHOWCASE_LIST",
  "SHOWCASE_VOID"
] as const;

type ProfileShowcaseCreativeType = (typeof profileShowcaseCreativeTypes)[number];

const profileMusicBlockTypes = new Set([
  "MUSIC_TASTE_WITH_MORE",
  "PERSONAL_ALBUM_RACK",
  "PERSONAL_SHOWCASE",
  "PLAYLIST_LIST_WITH_MORE",
  "SONG_LIST"
]);

function normalizeProfileMusicCards(payloads: readonly unknown[]): {
  readonly available: boolean;
  readonly items: readonly NeteaseNormalizedMusicCard[];
} {
  const blocks: JsonObject[] = [];
  for (const payload of payloads) {
    if (!isObject(payload) || !isObject(payload.data) || !Array.isArray(payload.data.blocks)) {
      throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
    }
    blocks.push(...payload.data.blocks.filter(isObject));
  }
  const supportedBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(
      ({ block }) =>
        typeof block.showType === "string" && profileMusicBlockTypes.has(block.showType)
    )
    .sort(
      (left, right) =>
        blockPosition(left.block, left.index) - blockPosition(right.block, right.index)
    )
    .map(({ block }) => block);
  const cards = supportedBlocks.flatMap(normalizeProfileMusicBlock);
  return {
    available: supportedBlocks.length > 0,
    items: uniqueBy(cards, (card) => card.providerCardId)
  };
}

function normalizeProfileMusicBlock(block: JsonObject): NeteaseNormalizedMusicCard[] {
  const showType = nonEmpty(block.showType);
  if (!showType) return [];
  if (!Array.isArray(block.creatives)) {
    if (showType === "PERSONAL_SHOWCASE") {
      throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
    }
    return [];
  }
  const items: NeteaseNormalizedMusicCard[] = [];
  for (const [creativeIndex, candidate] of block.creatives.entries()) {
    if (!isObject(candidate)) {
      throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
    }
    const creativeType = nonEmpty(candidate.creativeType) ?? "PROFILE_BLOCK_RESOURCE";
    if (showType === "PERSONAL_SHOWCASE") {
      if (!isProfileShowcaseCreativeType(creativeType)) {
        throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
      }
      if (creativeType === "SHOWCASE_BUTTON") continue;
    }
    const resources = Array.isArray(candidate.resources) ? candidate.resources : [];
    for (const [resourceIndex, resourceCandidate] of resources.entries()) {
      if (!isObject(resourceCandidate) || !isObject(resourceCandidate.uiElement)) {
        throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
      }
      const uiElement = resourceCandidate.uiElement;
      const providerUiType = nonEmpty(uiElement.type);
      if (providerUiType === "nm.profilePage.all") continue;
      const mainTitle = isObject(uiElement.mainTitle) ? uiElement.mainTitle : null;
      const blockUi = isObject(block.uiElement) ? block.uiElement : null;
      const blockMainTitle = blockUi && isObject(blockUi.mainTitle) ? blockUi.mainTitle : null;
      const images = Array.isArray(uiElement.images) ? uiElement.images.filter(isObject) : [];
      const imageUrls = images.flatMap((image) => {
        const url = safeArtworkUrl(stringValue(image.imageUrl));
        return url ? [url] : [];
      });
      const subTitles = Array.isArray(uiElement.subTitles)
        ? uiElement.subTitles.filter(isObject)
        : [];
      const labels = Array.isArray(uiElement.labels) ? uiElement.labels.filter(isObject) : [];
      const textLines = uniqueStrings([
        ...subTitles.flatMap((item) => nonEmpty(item.title) ?? []),
        ...labels.flatMap((item) => nonEmpty(item.text) ?? [])
      ]);
      const superscript = isObject(uiElement.superscript)
        ? uiElement.superscript
        : (images.map((image) => image.superscript).find(isObject) ?? null);
      const jumpUrl = clickTarget(resourceCandidate.action ?? candidate.action ?? block.action);
      const resourceType = stringOrNumber(resourceCandidate.resourceType);
      const resourceId = stringOrNumber(resourceCandidate.resourceId);
      const creativeId = stringOrNumber(candidate.creativeId);
      const sourceBlockCode = stringOrNumber(block.code ?? block.blockCode);
      const providerVisibility = nonEmpty(
        resourceCandidate.visibleStatus ?? candidate.visibleStatus ?? block.visibleStatus
      );
      const providerCardId =
        showType === "PERSONAL_SHOWCASE" && creativeId && resources.length === 1
          ? creativeId
          : stableCardId(
              showType,
              providerUiType,
              creativeId,
              resourceId,
              creativeIndex,
              resourceIndex
            );
      items.push({
        artists: [],
        badgeIconUrl: safeArtworkUrl(stringValue(superscript?.picUrl)),
        badgeText: nonEmpty(superscript?.text),
        cardKind: profileMusicCardKind(
          providerUiType,
          creativeType,
          resourceType,
          jumpUrl,
          showType
        ),
        coverUrl: imageUrls[0] ?? null,
        creativeType,
        description: nonEmpty(superscript?.text) ?? textLines[0] ?? null,
        imageUrls,
        jumpUrl,
        providerCardId,
        providerPublic:
          providerVisibility !== "FOLLOW_USER_SEE" && providerVisibility !== "ONLY_MYSELF_SEE",
        providerUiType,
        providerVisibility,
        resourceId,
        resourceType,
        sourceBlockCode,
        sourceBlockType: showType,
        textLines,
        title: nonEmpty(mainTitle?.title) ?? nonEmpty(blockMainTitle?.title) ?? ""
      });
    }
  }
  return items;
}

function blockPosition(block: JsonObject, fallback: number) {
  return typeof block.modulePosition === "number" && Number.isFinite(block.modulePosition)
    ? block.modulePosition
    : Number.MAX_SAFE_INTEGER - 10_000 + fallback;
}

function isProfileShowcaseCreativeType(value: unknown): value is ProfileShowcaseCreativeType {
  return profileShowcaseCreativeTypes.includes(value as ProfileShowcaseCreativeType);
}

function clickTarget(value: unknown) {
  if (!isObject(value) || !isObject(value.clickAction)) return null;
  return safeProviderTarget(value.clickAction.targetUrl);
}

function safeProviderTarget(value: unknown) {
  const target = nonEmpty(value);
  if (!target) return null;
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" && url.protocol !== "orpheus:") return null;
    for (const key of [...url.searchParams.keys()]) {
      if (
        /^(?:authorization|cookie|music[_-]?u|csrf|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)$/i.test(
          key
        )
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function profileMusicCardKind(
  providerUiType: string | null,
  creativeType: string,
  resourceType: string | null,
  jumpUrl: string | null,
  showType: string
): NeteaseNormalizedMusicCard["cardKind"] {
  if (providerUiType === "nm.profilePage.song") return "song";
  if (providerUiType === "nm.profilePage.playlist") return "playlist";
  if (providerUiType === "nm.profilePage.albumrack") return "album";
  if (providerUiType === "nm.profilePage.myFavorite") return "favorite";
  if (providerUiType === "nm.profilePage.listenRank") return "ranking";
  if (providerUiType === "nm.profilePage.wiki.identity") return "medal";
  if (creativeType === "MY_FAVORITE") return "favorite";
  if (creativeType === "LISTEN_RANK") return "ranking";
  const semantic = `${resourceType ?? ""} ${jumpUrl ?? ""} ${showType}`.toLowerCase();
  if (semantic.includes("playlist")) return "playlist";
  if (semantic.includes("album")) return "album";
  if (semantic.includes("song") || semantic.includes("track")) return "song";
  if (semantic.includes("medal")) return "medal";
  if (creativeType === "SHOWCASE_LIST" && /listen|duration|time/.test(semantic)) {
    return "duration";
  }
  return "unknown";
}

function stableCardId(
  showType: string,
  providerUiType: string | null,
  creativeId: string | null,
  resourceId: string | null,
  creativeIndex: number,
  resourceIndex: number
) {
  return [
    showType,
    providerUiType ?? "unknown",
    creativeId ?? `creative-${creativeIndex}`,
    resourceId ?? `resource-${resourceIndex}`
  ].join(":");
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values)];
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

function optionalMatchingSnapshots(snapshots: readonly RawSnapshot[], sourceKind: string) {
  return snapshots.filter(
    (candidate) =>
      candidate.sourceKind === sourceKind || candidate.sourceKind.startsWith(`${sourceKind}.page.`)
  );
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
    if (url.protocol === "http:" && isNeteaseArtworkHost(url.hostname)) {
      url.protocol = "https:";
    }
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isNeteaseArtworkHost(hostname: string) {
  return (
    hostname === "music.163.com" ||
    hostname.endsWith(".music.163.com") ||
    hostname.endsWith(".music.126.net")
  );
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
    typeof value.musicCardsAvailable === "boolean" &&
    value.account !== null &&
    typeof value.account === "object"
  );
}
