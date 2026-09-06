import { ProviderSchemaMismatchError, RetryableProviderError } from "@nivalis/domain";
import type { JsonObject, SteamGameAchievements } from "@nivalis/domain";
import { SteamClient } from "./steam-client";
import { integer, object } from "./steam-validation";

export const STEAM_ACHIEVEMENT_BUDGET = 8;
export function sanitizeAchievements(
  value: unknown,
  steamId: string,
  appId: number
): SteamGameAchievements {
  const source = "steam.achievements";
  const root = object(value, source);
  if (root.restricted === true) return { appId, availability: "unavailable", reason: "private" };
  const stats = object(root.playerstats, source);
  if (stats.success === false)
    return { appId, availability: "unavailable", reason: "not_returned" };
  if (
    stats.success !== true ||
    stats.steamID !== steamId ||
    !Array.isArray(stats.achievements) ||
    stats.achievements.length > 5000
  )
    throw new ProviderSchemaMismatchError(source);
  const keys = new Set<string>();
  const items = stats.achievements.map((value) => {
    const item = object(value, source);
    if (
      typeof item.apiname !== "string" ||
      !item.apiname ||
      item.apiname.length > 256 ||
      keys.has(item.apiname)
    )
      throw new ProviderSchemaMismatchError(source);
    keys.add(item.apiname);
    if (item.achieved !== 0 && item.achieved !== 1) throw new ProviderSchemaMismatchError(source);
    const time = item.unlocktime == null ? null : integer(item.unlocktime, source, 253402300799);
    if (item.name !== undefined && (typeof item.name !== "string" || item.name.length > 512))
      throw new ProviderSchemaMismatchError(source);
    return {
      key: item.apiname,
      name: typeof item.name === "string" ? item.name : null,
      unlocked: item.achieved === 1,
      unlockedAt: item.achieved === 1 && time ? new Date(time * 1000).toISOString() : null
    };
  });
  return {
    appId,
    availability: "available",
    totalCount: items.length,
    unlockedCount: items.filter((item) => item.unlocked).length,
    items
  };
}

/** Bounded enrichment; never pretends that eight queried games cover a huge library. */
export async function collectAchievements(
  client: SteamClient,
  steamId: string,
  apiKey: string,
  library: JsonObject,
  recent: JsonObject
): Promise<JsonObject> {
  const owned = Array.isArray(library.games)
    ? library.games.map((value) => object(value, "steam.library"))
    : [];
  const recentGames = Array.isArray(recent.games)
    ? recent.games.map((value) => object(value, "steam.recent"))
    : [];
  const candidates = [
    ...new Set(
      [
        ...[...recentGames].sort(
          (a, b) => Number(b.playtime_2weeks ?? 0) - Number(a.playtime_2weeks ?? 0)
        ),
        ...[...owned].sort(
          (a, b) => Number(b.playtime_forever ?? 0) - Number(a.playtime_forever ?? 0)
        )
      ].map((game) => integer(game.appid, "steam.achievements", 0xffffffff))
    )
  ];
  const selected = candidates.slice(0, STEAM_ACHIEVEMENT_BUDGET);
  const games: SteamGameAchievements[] = [];
  let cursor = 0;
  let rateLimited = false;
  await Promise.all(
    Array.from({ length: Math.min(3, selected.length) }, async () => {
      while (cursor < selected.length) {
        const index = cursor++;
        const appId = selected[index]!;
        if (rateLimited) {
          games[index] = { appId, availability: "unavailable", reason: "temporarily_unavailable" };
          continue;
        }
        try {
          games[index] = sanitizeAchievements(
            await client.get("achievements", steamId, apiKey, appId),
            steamId,
            appId
          );
        } catch (error) {
          if (error instanceof RetryableProviderError) rateLimited = true;
          else if (!(error instanceof ProviderSchemaMismatchError)) throw error;
          games[index] = {
            appId,
            availability: "unavailable",
            reason:
              error instanceof ProviderSchemaMismatchError
                ? "schema_mismatch"
                : "temporarily_unavailable"
          };
        }
      }
    })
  );
  return {
    scope: "recent_and_most_played",
    requestBudget: STEAM_ACHIEVEMENT_BUDGET,
    candidateCount: Array.isArray(library.games) ? candidates.length : null,
    games
  };
}

export function normalizeAchievements(value: unknown): {
  scope: "recent_and_most_played";
  requestBudget: number;
  candidateCount: number | null;
  games: SteamGameAchievements[];
} {
  const source = "steam.achievements";
  if (value === undefined)
    return {
      scope: "recent_and_most_played",
      requestBudget: STEAM_ACHIEVEMENT_BUDGET,
      candidateCount: null,
      games: []
    };
  const raw = object(value, source);
  if (
    raw.scope !== "recent_and_most_played" ||
    raw.requestBudget !== STEAM_ACHIEVEMENT_BUDGET ||
    !Array.isArray(raw.games) ||
    raw.games.length > STEAM_ACHIEVEMENT_BUDGET
  )
    throw new ProviderSchemaMismatchError(source);
  const candidateCount =
    raw.candidateCount === null ? null : integer(raw.candidateCount, source, 100000);
  const ids = new Set<number>();
  const games = raw.games.map((value): SteamGameAchievements => {
    const game = object(value, source);
    const appId = integer(game.appId, source, 0xffffffff);
    if (!appId || ids.has(appId)) throw new ProviderSchemaMismatchError(source);
    ids.add(appId);
    if (game.availability === "unavailable") {
      if (
        game.reason !== "private" &&
        game.reason !== "not_returned" &&
        game.reason !== "temporarily_unavailable" &&
        game.reason !== "schema_mismatch"
      )
        throw new ProviderSchemaMismatchError(source);
      return { appId, availability: "unavailable", reason: game.reason };
    }
    if (game.availability !== "available" || !Array.isArray(game.items) || game.items.length > 5000)
      throw new ProviderSchemaMismatchError(source);
    const keys = new Set<string>();
    const items = game.items.map((value) => {
      const item = object(value, source);
      if (
        typeof item.key !== "string" ||
        !item.key ||
        item.key.length > 256 ||
        keys.has(item.key) ||
        typeof item.unlocked !== "boolean" ||
        (item.name !== null && (typeof item.name !== "string" || item.name.length > 512)) ||
        (item.unlockedAt !== null &&
          (typeof item.unlockedAt !== "string" ||
            !Number.isFinite(Date.parse(item.unlockedAt)) ||
            !item.unlocked))
      )
        throw new ProviderSchemaMismatchError(source);
      keys.add(item.key);
      return {
        key: item.key,
        name: item.name,
        unlocked: item.unlocked,
        unlockedAt: item.unlockedAt
      };
    });
    if (
      game.totalCount !== items.length ||
      game.unlockedCount !== items.filter((item) => item.unlocked).length
    )
      throw new ProviderSchemaMismatchError(source);
    return {
      appId,
      availability: "available",
      totalCount: items.length,
      unlockedCount: Number(game.unlockedCount),
      items
    };
  });
  if (
    candidateCount !== null &&
    games.length !== Math.min(candidateCount, STEAM_ACHIEVEMENT_BUDGET)
  )
    throw new ProviderSchemaMismatchError(source);
  return {
    scope: "recent_and_most_played",
    requestBudget: STEAM_ACHIEVEMENT_BUDGET,
    candidateCount,
    games
  };
}
