import type { ProviderCredentialResolver } from "@nivalis/application";
import type {
  JsonObject,
  JsonValue,
  ProviderConnector,
  ProviderFetchResult,
  SyncRun
} from "@nivalis/domain";

import { NeteaseClient } from "./netease-client";
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

function snapshot(sourceKind: string, payload: ProviderFetchResult["payload"], fetchedAt: Date) {
  return { fetchedAt, payload: sanitizeNeteasePayload(payload), schemaVersion: 1, sourceKind };
}

export function sanitizeNeteasePayload(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sanitizeNeteasePayload);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isCredentialKey(key))
      .map(([key, nested]) => [key, sanitizeNeteasePayload(nested)])
  );
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
