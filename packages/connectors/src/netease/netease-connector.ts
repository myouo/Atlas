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
    const weekly = await this.client.getWeeklyRecord(credential, userId);
    snapshots.push(snapshot(NETEASE_SOURCE.weeklyRecord, weekly, this.now()));
    const recent = await this.client.getRecentSongs(credential);
    snapshots.push(snapshot(NETEASE_SOURCE.recentSongs, recent, this.now()));
    const report = await this.client.getWeeklyListenReport(credential);
    snapshots.push(snapshot(NETEASE_SOURCE.listenReportWeek, report, this.now()));
    return snapshots;
  }
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
