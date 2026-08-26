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
    private readonly now: () => Date = () => new Date()
  ) {}

  async fetch(run: SyncRun): Promise<readonly ProviderFetchResult[]> {
    const credential = await this.credentials.resolve(run.providerConnectionId, "music_u");
    const account = await this.client.getAccount(credential);
    const fetchedAt = this.now();
    const snapshots: ProviderFetchResult[] = [snapshot(NETEASE_SOURCE.account, account, fetchedAt)];
    const userId = extractUserId(account);
    if (!userId) return snapshots;

    const detail = await this.client.getUserDetail(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.userDetail, detail, this.now()));
    const profileHome = await this.client.getProfileHome(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.profileHome, profileHome, this.now()));
    snapshots.push(...(await profileHomePageSnapshots(this.client, credential, userId, this.now)));
    const profileMusicCards = await this.client.getProfileMusicCards(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.profileMusicCards, profileMusicCards, this.now()));
    const level = await this.client.getUserLevel(credential);
    snapshots.push(snapshot(NETEASE_SOURCE.userLevel, level, this.now()));
    const vip = await this.client.getVipInfo(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.vipInfo, vip, this.now()));
    const listenTotal = await this.client.getTotalListenData(credential);
    snapshots.push(snapshot(NETEASE_SOURCE.listenTotal, listenTotal, this.now()));
    const weekly = await this.client.getWeeklyRecord(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.weeklyRecord, weekly, this.now()));
    const allTime = await this.client.getAllTimeRecord(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.allTimeRecord, allTime, this.now()));
    const recent = await this.client.getRecentSongs(credential);
    snapshots.push(snapshot(NETEASE_SOURCE.recentSongs, recent, this.now()));
    const report = await this.client.getWeeklyListenReport(credential);
    snapshots.push(snapshot(NETEASE_SOURCE.listenReportWeek, report, this.now()));
    snapshots.push(
      ...(await paginatedSnapshots(
        NETEASE_SOURCE.following,
        (offset) => this.client.getFollowing(credential, userId, offset),
        (payload) => pageInfo(payload, "follow", undefined, "userId"),
        this.now
      ))
    );
    snapshots.push(
      ...(await paginatedSnapshots(
        NETEASE_SOURCE.followers,
        (offset) => this.client.getFollowers(credential, userId, offset),
        (payload) => pageInfo(payload, "followeds", undefined, "userId"),
        this.now
      ))
    );
    snapshots.push(
      ...(await paginatedSnapshots(
        NETEASE_SOURCE.createdPlaylists,
        (offset) => this.client.getCreatedPlaylists(credential, userId, offset),
        (payload) => pageInfo(payload, "playlist", "data", "id"),
        this.now
      ))
    );
    const medals = await this.client.getUserMedals(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.medals, medals, this.now()));
    const socialStatus = await this.client.getUserSocialStatus(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.socialStatus, socialStatus, this.now()));
    return snapshots;
  }
}

const MAX_PROVIDER_LIST_ITEMS = 500;
const MAX_PROVIDER_LIST_PAGES = 20;
const MAX_PROFILE_HOME_PAGES = 20;

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

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
