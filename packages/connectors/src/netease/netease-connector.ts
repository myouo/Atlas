import type { ProviderCredentialResolver } from "@nivalis/application";
import { ProviderSchemaMismatchError } from "@nivalis/domain";
import type {
  JsonObject,
  JsonValue,
  ProviderConnector,
  ProviderFetchResult,
  SyncRun
} from "@nivalis/domain";

import { NeteaseClient, type NeteaseProfileCursor } from "./netease-client";
import { NETEASE_SOURCE } from "./netease-types";

export class NeteaseConnector implements ProviderConnector {
  readonly provider = "netease" as const;

  constructor(
    private readonly client: NeteaseClient,
    private readonly credentials: ProviderCredentialResolver,
    private readonly now: () => Date = () => new Date(),
    private readonly maxRequestConcurrency = 1
  ) {}

  async fetch(run: SyncRun): Promise<readonly ProviderFetchResult[]> {
    const credential = await this.credentials.resolve(run.providerConnectionId, "music_u");
    const account = await this.client.getAccount(credential);
    const fetchedAt = this.now();
    const snapshots: ProviderFetchResult[] = [snapshot(NETEASE_SOURCE.account, account, fetchedAt)];
    const userId = extractUserId(account);
    if (!userId) return snapshots;
    const tasks: readonly ProviderFetchTask[] = [
      async () => [
        snapshot(
          NETEASE_SOURCE.userDetail,
          await this.client.getUserDetail(credential, userId),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.profileHome,
          await this.client.getProfileHome(credential, userId),
          this.now()
        )
      ],
      () => profileHomePageSnapshots(this.client, credential, userId, this.now),
      async () => {
        const profileMusicCards = await this.client.getProfileMusicCards(credential, userId);
        const results = [snapshot(NETEASE_SOURCE.profileMusicCards, profileMusicCards, this.now())];
        const trackIds = profileMusicCardSongIds(profileMusicCards);
        if (trackIds.length > 0) {
          results.push(
            snapshot(
              NETEASE_SOURCE.musicCardTracks,
              await this.client.getSongDetails(credential, trackIds),
              this.now()
            )
          );
        }
        return results;
      },
      async () => [
        snapshot(NETEASE_SOURCE.userLevel, await this.client.getUserLevel(credential), this.now())
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.vipInfo,
          await this.client.getVipInfo(credential, userId),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.listenTotal,
          await this.client.getTotalListenData(credential),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.weeklyRecord,
          await this.client.getWeeklyRecord(credential, userId),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.allTimeRecord,
          await this.client.getAllTimeRecord(credential, userId),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.recentSongs,
          await this.client.getRecentSongs(credential),
          this.now()
        )
      ],
      () => listeningReportSnapshots(this.client, credential, this.now),
      async () => [
        snapshot(
          NETEASE_SOURCE.listenRankWeek,
          await this.client.getListenPlayRank(credential, "week"),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.listenRankMonth,
          await this.client.getListenPlayRank(credential, "month"),
          this.now()
        )
      ],
      () =>
        paginatedSnapshots(
          NETEASE_SOURCE.following,
          (offset) => this.client.getFollowing(credential, userId, offset),
          (payload) => pageInfo(payload, "follow", undefined, "userId"),
          this.now
        ),
      () =>
        paginatedSnapshots(
          NETEASE_SOURCE.followers,
          (offset) => this.client.getFollowers(credential, userId, offset),
          (payload) => pageInfo(payload, "followeds", undefined, "userId"),
          this.now
        ),
      () =>
        paginatedSnapshots(
          NETEASE_SOURCE.createdPlaylists,
          (offset) => this.client.getCreatedPlaylists(credential, userId, offset),
          (payload) => pageInfo(payload, "playlist", "data", "id"),
          this.now
        ),
      async () => [
        snapshot(
          NETEASE_SOURCE.medals,
          await this.client.getUserMedals(credential, userId),
          this.now()
        )
      ],
      async () => [
        snapshot(
          NETEASE_SOURCE.socialStatus,
          await this.client.getUserSocialStatus(credential, userId),
          this.now()
        )
      ]
    ];
    snapshots.push(...(await runProviderTasks(tasks, this.maxRequestConcurrency)));
    return snapshots;
  }
}

type ProviderFetchTask = () => Promise<readonly ProviderFetchResult[]>;

function profileMusicCardSongIds(payload: JsonValue) {
  if (!isObject(payload) || !isObject(payload.data) || !Array.isArray(payload.data.cardVOList)) {
    return [];
  }
  return [
    ...new Set(
      payload.data.cardVOList.flatMap((card) => {
        if (!isObject(card)) return [];
        if (card.resType !== "song" && card.resType !== "latest_heart_song") return [];
        if (typeof card.resId !== "string" || !/^\d+$/.test(card.resId)) return [];
        return [card.resId];
      })
    )
  ].slice(0, 6);
}

const MAX_PROVIDER_LIST_ITEMS = 500;
const MAX_PROVIDER_LIST_PAGES = 20;
const MAX_PROFILE_HOME_PAGES = 20;
const MAX_LISTEN_HISTORY_PERIODS = 3;
const MAX_NETEASE_REQUEST_CONCURRENCY = 3;

async function runProviderTasks(tasks: readonly ProviderFetchTask[], requestedConcurrency: number) {
  const concurrency = Math.min(
    tasks.length,
    MAX_NETEASE_REQUEST_CONCURRENCY,
    Math.max(1, Number.isInteger(requestedConcurrency) ? requestedConcurrency : 1)
  );
  const results: Array<readonly ProviderFetchResult[]> = new Array(tasks.length);
  let nextIndex = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (!failed && nextIndex < tasks.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = await tasks[index]!();
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    })
  );
  return results.flat();
}

async function listeningReportSnapshots(
  client: NeteaseClient,
  credential: string,
  now: () => Date
) {
  const results: ProviderFetchResult[] = [];
  const weekly = await client.getWeeklyListenReport(credential);
  results.push(snapshot(NETEASE_SOURCE.listenReportWeek, weekly, now()));
  const previousWeekEndTime = previousPeriodEndTime(weekly);
  if (previousWeekEndTime !== null) {
    results.push(
      ...(await historicalReportSnapshots(
        client,
        credential,
        "week",
        NETEASE_SOURCE.listenReportPreviousWeek,
        previousWeekEndTime,
        now
      ))
    );
  }
  const monthly = await client.getMonthlyListenReport(credential);
  results.push(snapshot(NETEASE_SOURCE.listenReportMonth, monthly, now()));
  const previousMonthEndTime = previousPeriodEndTime(monthly);
  if (previousMonthEndTime !== null) {
    results.push(
      ...(await historicalReportSnapshots(
        client,
        credential,
        "month",
        NETEASE_SOURCE.listenReportPreviousMonth,
        previousMonthEndTime,
        now
      ))
    );
  }
  return results;
}

async function profileHomePageSnapshots(
  client: NeteaseClient,
  credential: string,
  userId: string,
  now: () => Date
) {
  const results: ProviderFetchResult[] = [];
  const seenCursors = new Set<string>();
  let cursor: NeteaseProfileCursor | undefined;
  for (let page = 0; page < MAX_PROFILE_HOME_PAGES; page += 1) {
    const payload = await client.getProfileHomePage(credential, userId, cursor);
    const sourceCursor = cursor ? canonicalCursor(cursor) : undefined;
    results.push(
      snapshot(
        page === 0
          ? NETEASE_SOURCE.profileShowcase
          : `${NETEASE_SOURCE.profileShowcase}.page.${page}`,
        payload,
        now(),
        sourceCursor
      )
    );
    const state = profileHomePageState(payload);
    if (!state.more) return results;
    if (!state.cursor || page === MAX_PROFILE_HOME_PAGES - 1) {
      throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
    }
    const nextCursor = canonicalCursor(state.cursor);
    if (seenCursors.has(nextCursor)) {
      throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
    }
    seenCursors.add(nextCursor);
    cursor = state.cursor;
  }
  throw new ProviderSchemaMismatchError(NETEASE_SOURCE.profileShowcase);
}

function profileHomePageState(payload: JsonValue): {
  readonly cursor: NeteaseProfileCursor | null;
  readonly more: boolean;
} {
  if (!isObject(payload) || !isObject(payload.data)) {
    return { cursor: null, more: false };
  }
  if (payload.data.hasMore !== true) return { cursor: null, more: false };
  if (typeof payload.data.cursor === "string") {
    return payload.data.cursor.length > 0
      ? { cursor: payload.data.cursor, more: true }
      : { cursor: null, more: true };
  }
  if (!isObject(payload.data.cursor)) return { cursor: null, more: true };
  const entries = Object.entries(payload.data.cursor);
  if (entries.length === 0) return { cursor: null, more: true };
  const cursor: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string") return { cursor: null, more: true };
    cursor[key] = value;
  }
  return { cursor, more: true };
}

function canonicalCursor(cursor: NeteaseProfileCursor) {
  if (typeof cursor === "string") return cursor;
  return JSON.stringify(
    Object.fromEntries(Object.entries(cursor).sort(([a], [b]) => a.localeCompare(b)))
  );
}

async function paginatedSnapshots(
  baseSourceKind: string,
  load: (offset: number) => Promise<JsonValue>,
  inspect: (payload: JsonValue) => {
    readonly count: number;
    readonly ids: readonly string[];
    readonly more: boolean;
  },
  now: () => Date
) {
  const results: ProviderFetchResult[] = [];
  const seenIds = new Set<string>();
  let offset = 0;
  for (
    let page = 0;
    page < MAX_PROVIDER_LIST_PAGES && offset < MAX_PROVIDER_LIST_ITEMS;
    page += 1
  ) {
    const payload = await load(offset);
    results.push(
      snapshot(page === 0 ? baseSourceKind : `${baseSourceKind}.page.${page}`, payload, now())
    );
    const state = inspect(payload);
    if (!state.more || state.count === 0) break;
    const newIds = state.ids.filter((id) => !seenIds.has(id));
    state.ids.forEach((id) => seenIds.add(id));
    if (state.ids.length > 0 && newIds.length === 0) break;
    offset += state.count;
  }
  return results;
}

async function historicalReportSnapshots(
  client: NeteaseClient,
  credential: string,
  period: "month" | "week",
  sourceKind: string,
  initialEndTime: number,
  now: () => Date
) {
  const results: ProviderFetchResult[] = [];
  const seenStartTimes = new Set<number>();
  let endTime = initialEndTime;
  for (let index = 0; index < MAX_LISTEN_HISTORY_PERIODS; index += 1) {
    const payload = await client.getHistoricalListenReport(credential, period, endTime);
    const state = historicalReportState(payload);
    if (!state || seenStartTimes.has(state.startTime)) break;
    seenStartTimes.add(state.startTime);
    results.push(
      snapshot(index === 0 ? sourceKind : `${sourceKind}.period.${index}`, payload, now())
    );
    if (!state.hasDailyData || state.startTime <= 1) break;
    endTime = state.startTime - 1;
  }
  return results;
}

function historicalReportState(payload: JsonValue) {
  if (!isObject(payload) || !isObject(payload.data)) return null;
  const startTime = payload.data.startTime;
  const distribution = payload.data.listenTimeDistributionBlock;
  if (typeof startTime !== "number" || !Number.isSafeInteger(startTime) || startTime <= 0) {
    return null;
  }
  return {
    hasDailyData:
      isObject(distribution) &&
      Array.isArray(distribution.durationDetails) &&
      distribution.durationDetails.length > 0,
    startTime
  };
}

function pageInfo(payload: JsonValue, listKey: string, containerKey?: string, idKey = "id") {
  if (!isObject(payload)) return { count: 0, ids: [], more: false };
  const container =
    containerKey && isObject(payload[containerKey]) ? payload[containerKey] : payload;
  const items = Array.isArray(container[listKey]) ? container[listKey] : [];
  return {
    count: items.length,
    ids: items.flatMap((item) => {
      if (!isObject(item)) return [];
      const value = item[idKey];
      return typeof value === "string" || typeof value === "number" ? [String(value)] : [];
    }),
    more: container.more === true || payload.more === true
  };
}

function snapshot(
  sourceKind: string,
  payload: ProviderFetchResult["payload"],
  fetchedAt: Date,
  sourceCursor?: string
) {
  return {
    fetchedAt,
    payload: sanitizeNeteasePayload(payload),
    schemaVersion: 1,
    sourceKind,
    ...(sourceCursor ? { sourceCursor } : {})
  };
}

export function sanitizeNeteasePayload(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sanitizeNeteasePayload);
  if (typeof value === "string") return sanitizeNeteaseString(value);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isCredentialKey(key))
      .map(([key, nested]) => [key, sanitizeNeteasePayload(nested)])
  );
}

function sanitizeNeteaseString(value: string) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isCredentialKey(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return /(?:authorization|cookie|music[_-]?u|csrf|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\s*[:=]/i.test(
      value
    )
      ? "[redacted]"
      : value;
  }
}

function isCredentialKey(key: string) {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return (
    normalized === "authorization" ||
    normalized === "csrf" ||
    normalized === "musicu" ||
    normalized === "token" ||
    normalized.endsWith("accesstoken") ||
    normalized.endsWith("refreshtoken") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("cookie") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret")
  );
}

function extractUserId(payload: ProviderFetchResult["payload"]): string | null {
  if (!isObject(payload) || payload.code !== 200) return null;
  const profile = isObject(payload.profile) ? payload.profile : null;
  const account = isObject(payload.account) ? payload.account : null;
  const value = profile?.userId ?? account?.id;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function previousPeriodEndTime(payload: ProviderFetchResult["payload"]): number | null {
  if (!isObject(payload) || !isObject(payload.data)) return null;
  const startTime = payload.data.startTime;
  return typeof startTime === "number" && Number.isSafeInteger(startTime) && startTime > 1
    ? startTime - 1
    : null;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
