import { ProviderSchemaMismatchError } from "@nivalis/domain";
import type { JsonObject, SteamGame, SteamNormalizedData, SteamUnavailable } from "@nivalis/domain";

export function object(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderSchemaMismatchError(source);
  return value as Record<string, unknown>;
}
export function integer(value: unknown, source: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new ProviderSchemaMismatchError(source);
  return value;
}
function text(value: unknown, source: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    throw new ProviderSchemaMismatchError(source);
  return value;
}
export function unavailable(reason: SteamUnavailable["reason"]): SteamUnavailable {
  return { availability: "unavailable", reason };
}

export function sanitizeProfile(value: unknown, steamId: string): JsonObject {
  const source = "steam.profile";
  const players = object(object(value, source).response, source).players;
  if (!Array.isArray(players) || players.length !== 1)
    throw new ProviderSchemaMismatchError(source);
  const account = object(players[0], source);
  if (account.steamid !== steamId) throw new ProviderSchemaMismatchError(source);
  return {
    steamid: steamId,
    personaname: text(account.personaname, source),
    communityvisibilitystate: integer(account.communityvisibilitystate, source, 3),
    personastate:
      account.personastate === undefined ? null : integer(account.personastate, source, 6),
    avatarfull: avatar(account.avatarfull)
  };
}

function avatar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return null;
    const allowed = [
      "avatars.steamstatic.com",
      "avatars.fastly.steamstatic.com",
      "avatars.akamai.steamstatic.com",
      "steamcdn-a.akamaihd.net"
    ];
    return allowed.includes(url.hostname) && url.pathname.length <= 512 ? url.href : null;
  } catch {
    return null;
  }
}

export function sanitizeGames(value: unknown, kind: "library" | "recent"): JsonObject {
  const source = `steam.${kind}`;
  const root = object(value, source);
  const response = object(root.response, source);
  const countKey = kind === "library" ? "game_count" : "total_count";
  if (root.restricted === true) return unavailable("private");
  // An omitted count is not evidence of an empty library.
  if (response[countKey] === undefined && Object.keys(response).length === 0)
    return unavailable("not_returned");
  const count = integer(response[countKey], source, 50_000);
  const games = response.games ?? (count === 0 ? [] : null);
  if (
    !Array.isArray(games) ||
    games.length > (kind === "library" ? 50_000 : 20) ||
    (kind === "library" ? games.length !== count : games.length !== Math.min(count, 20))
  )
    throw new ProviderSchemaMismatchError(source);
  const ids = new Set<number>();
  const sanitized = games.map((item) => {
    const game = object(item, source);
    const id = integer(game.appid, source, 0xffffffff);
    if (id === 0 || ids.has(id)) throw new ProviderSchemaMismatchError(source);
    ids.add(id);
    return {
      appid: id,
      name: text(game.name, source),
      img_icon_url:
        typeof game.img_icon_url === "string" && /^[a-fA-F0-9]{40}$/.test(game.img_icon_url)
          ? game.img_icon_url
          : null,
      playtime_forever:
        game.playtime_forever === undefined ? null : integer(game.playtime_forever, source),
      playtime_2weeks:
        game.playtime_2weeks === undefined ? null : integer(game.playtime_2weeks, source)
    };
  });
  return { [countKey]: count, games: sanitized };
}

export function sanitizeLevel(value: unknown): JsonObject {
  const response = object(object(value, "steam.level").response, "steam.level");
  return {
    player_level:
      response.player_level === undefined ? null : integer(response.player_level, "steam.level")
  };
}

export function normalizeSteam(sources: ReadonlyMap<string, unknown>): SteamNormalizedData {
  const raw = object(sources.get("steam.profile"), "steam.profile");
  if (typeof raw.steamid !== "string" || !/^\d{17}$/.test(raw.steamid))
    throw new ProviderSchemaMismatchError("steam.profile");
  const level = object(sources.get("steam.level"), "steam.level");
  const account = {
    availability: "available" as const,
    steamId: raw.steamid,
    displayName: text(raw.personaname, "steam.profile"),
    profileUrl: `https://steamcommunity.com/profiles/${raw.steamid}/`,
    avatarUrl: avatar(raw.avatarfull),
    visibility: integer(raw.communityvisibilitystate, "steam.profile", 3),
    personaState: raw.personastate === null ? null : integer(raw.personastate, "steam.profile", 6),
    level: level.player_level === null ? null : integer(level.player_level, "steam.level")
  };
  const libraryRaw = object(sources.get("steam.library"), "steam.library");
  const recentRaw = object(sources.get("steam.recent"), "steam.recent");
  function restricted(raw: Record<string, unknown>): SteamUnavailable | null {
    if (raw.availability !== "unavailable") return null;
    if (raw.reason !== "private" && raw.reason !== "not_returned")
      throw new ProviderSchemaMismatchError("steam.library");
    return unavailable(raw.reason);
  }
  function games(raw: Record<string, unknown>): SteamGame[] {
    if (!Array.isArray(raw.games)) throw new ProviderSchemaMismatchError("steam.library");
    return raw.games.map((item) => {
      const game = object(item, "steam.library");
      const appId = integer(game.appid, "steam.library", 0xffffffff);
      if (appId === 0) throw new ProviderSchemaMismatchError("steam.library");
      const hash =
        typeof game.img_icon_url === "string" && /^[a-fA-F0-9]{40}$/.test(game.img_icon_url)
          ? game.img_icon_url
          : null;
      return {
        appId,
        name: text(game.name, "steam.library"),
        iconUrl: hash
          ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`
          : null,
        storeUrl: `https://store.steampowered.com/app/${appId}/`,
        playtimeMinutes:
          game.playtime_forever === null ? null : integer(game.playtime_forever, "steam.library"),
        recentPlaytimeMinutes:
          game.playtime_2weeks === null ? null : integer(game.playtime_2weeks, "steam.recent")
      };
    });
  }
  const libraryUnavailable = restricted(libraryRaw);
  const libraryGames = libraryUnavailable ? [] : games(libraryRaw);
  if (
    !libraryUnavailable &&
    (integer(libraryRaw.game_count, "steam.library", 50_000) !== libraryGames.length ||
      new Set(libraryGames.map((game) => game.appId)).size !== libraryGames.length)
  )
    throw new ProviderSchemaMismatchError("steam.library");
  const recentUnavailable = restricted(recentRaw);
  const recentGames = recentUnavailable ? [] : games(recentRaw);
  if (
    !recentUnavailable &&
    (Math.min(integer(recentRaw.total_count, "steam.recent", 50_000), 20) !== recentGames.length ||
      new Set(recentGames.map((game) => game.appId)).size !== recentGames.length)
  )
    throw new ProviderSchemaMismatchError("steam.recent");
  const total = libraryGames.reduce((sum, game) => sum + (game.playtimeMinutes ?? 0), 0);
  if (!Number.isSafeInteger(total)) throw new ProviderSchemaMismatchError("steam.library");
  const knownPlaytime = libraryGames.every((game) => game.playtimeMinutes !== null);
  return {
    provider: "steam",
    account,
    library:
      account.visibility !== 3
        ? unavailable("private")
        : (libraryUnavailable ?? {
            availability: "available",
            gameCount: integer(libraryRaw.game_count, "steam.library"),
            playtimeMinutes: knownPlaytime ? total : null,
            playedGameCount: knownPlaytime
              ? libraryGames.filter((game) => (game.playtimeMinutes ?? 0) > 0).length
              : null,
            games: libraryGames
          }),
    recentGames:
      account.visibility !== 3
        ? unavailable("private")
        : (recentUnavailable ?? {
            availability: "available",
            totalCount: integer(recentRaw.total_count, "steam.recent"),
            items: recentGames
          })
  };
}
