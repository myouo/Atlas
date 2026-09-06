import { ProviderSchemaMismatchError } from "@nivalis/domain";
import type {
  JsonObject,
  SteamDetailedGame,
  SteamCatalogData,
  SteamBadges,
  SteamCoverage,
  SteamUnavailable
} from "@nivalis/domain";
import { normalizeAchievements } from "./steam-achievements";
import { object, integer } from "./steam-validation";
export { object, integer } from "./steam-validation";

export const STEAM_MAX_GAMES = 50_000;
function nullableInteger(value: unknown, source: string, max = Number.MAX_SAFE_INTEGER) {
  return value === undefined || value === null ? null : integer(value, source, max);
}
function timestamp(value: unknown, source: string): string | null {
  const seconds = nullableInteger(value, source, 253402300799);
  return seconds === null || seconds === 0 ? null : new Date(seconds * 1000).toISOString();
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
    avatarfull: avatar(account.avatarfull),
    timecreated: nullableInteger(account.timecreated, source, 253402300799),
    lastlogoff: nullableInteger(account.lastlogoff, source, 253402300799),
    gameid:
      typeof account.gameid === "string" && /^\d{1,20}$/.test(account.gameid)
        ? account.gameid
        : null,
    gameextrainfo: account.gameextrainfo === undefined ? null : text(account.gameextrainfo, source)
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
  const count = integer(response[countKey], source, STEAM_MAX_GAMES);
  const games = response.games ?? (count === 0 ? [] : null);
  if (!Array.isArray(games) || games.length > STEAM_MAX_GAMES || games.length !== count)
    throw new ProviderSchemaMismatchError(source);
  const ids = new Set<number>();
  const sanitized = games.map((item) => {
    const game = object(item, source);
    const id = integer(game.appid, source, 0xffffffff);
    if (id === 0 || ids.has(id)) throw new ProviderSchemaMismatchError(source);
    ids.add(id);
    return {
      appid: id,
      name:
        game.name === undefined || game.name === null || game.name === ""
          ? null
          : text(game.name, source),
      img_icon_url:
        typeof game.img_icon_url === "string" && /^[a-fA-F0-9]{40}$/.test(game.img_icon_url)
          ? game.img_icon_url
          : null,
      playtime_forever:
        game.playtime_forever === undefined ? null : integer(game.playtime_forever, source),
      playtime_2weeks:
        game.playtime_2weeks === undefined ? null : integer(game.playtime_2weeks, source),
      playtime_windows_forever: nullableInteger(game.playtime_windows_forever, source),
      playtime_mac_forever: nullableInteger(game.playtime_mac_forever, source),
      playtime_linux_forever: nullableInteger(game.playtime_linux_forever, source),
      playtime_deck_forever: nullableInteger(game.playtime_deck_forever, source),
      rtime_last_played: nullableInteger(game.rtime_last_played, source, 253402300799),
      has_community_visible_stats: booleanOrNull(game.has_community_visible_stats, source)
    };
  });
  return { [countKey]: count, games: sanitized };
}

function booleanOrNull(value: unknown, source: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new ProviderSchemaMismatchError(source);
  return value;
}

export function sanitizeBadges(value: unknown): JsonObject {
  const source = "steam.badges";
  const root = object(value, source);
  if (root.restricted === true) return unavailable("private");
  const response = object(root.response, source);
  if (Object.keys(response).length === 0) return unavailable("not_returned");
  if (!Array.isArray(response.badges) || response.badges.length > STEAM_MAX_GAMES)
    throw new ProviderSchemaMismatchError(source);
  const ids = new Set<string>();
  const badges = response.badges.map((item) => {
    const badge = object(item, source);
    const badgeid = integer(badge.badgeid, source, 0xffffffff);
    const appid = nullableInteger(badge.appid, source, 0xffffffff);
    const border = nullableInteger(badge.border_color, source);
    const id = `${badgeid}:${appid}:${border}`;
    if (ids.has(id)) throw new ProviderSchemaMismatchError(source);
    ids.add(id);
    return {
      badgeid,
      appid,
      border_color: border,
      level: integer(badge.level, source),
      xp: nullableInteger(badge.xp, source),
      completion_time: nullableInteger(badge.completion_time, source, 253402300799),
      scarcity: nullableInteger(badge.scarcity, source)
    };
  });
  return {
    badges,
    player_xp: nullableInteger(response.player_xp, source),
    player_level: nullableInteger(response.player_level, source),
    player_xp_needed_to_level_up: nullableInteger(response.player_xp_needed_to_level_up, source),
    player_xp_needed_current_level: nullableInteger(response.player_xp_needed_current_level, source)
  };
}

export function sanitizeLevel(value: unknown): JsonObject {
  const response = object(object(value, "steam.level").response, "steam.level");
  return {
    player_level:
      response.player_level === undefined ? null : integer(response.player_level, "steam.level")
  };
}

export function normalizeSteam(
  sources: ReadonlyMap<string, unknown>,
  recentSourceVersion = 2
): SteamCatalogData {
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
  function games(raw: Record<string, unknown>): SteamDetailedGame[] {
    if (!Array.isArray(raw.games) || raw.games.length > STEAM_MAX_GAMES)
      throw new ProviderSchemaMismatchError("steam.library");
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
        name: game.name === null ? `Steam App ${appId}` : text(game.name, "steam.library"),
        nameSource: game.name === null ? ("app_id" as const) : ("steam" as const),
        iconUrl: hash
          ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`
          : null,
        storeUrl: `https://store.steampowered.com/app/${appId}/`,
        playtimeMinutes:
          game.playtime_forever === null ? null : integer(game.playtime_forever, "steam.library"),
        recentPlaytimeMinutes:
          game.playtime_2weeks === null ? null : integer(game.playtime_2weeks, "steam.recent"),
        lastPlayedAt: timestamp(game.rtime_last_played, "steam.library"),
        hasCommunityVisibleStats: booleanOrNull(game.has_community_visible_stats, "steam.library"),
        platformPlaytimeMinutes: {
          windows: nullableInteger(game.playtime_windows_forever, "steam.library"),
          mac: nullableInteger(game.playtime_mac_forever, "steam.library"),
          linux: nullableInteger(game.playtime_linux_forever, "steam.library"),
          steamDeck: nullableInteger(game.playtime_deck_forever, "steam.library")
        }
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
    (Math.min(
      integer(recentRaw.total_count, "steam.recent", STEAM_MAX_GAMES),
      recentSourceVersion === 1 ? 20 : STEAM_MAX_GAMES
    ) !== recentGames.length ||
      new Set(recentGames.map((game) => game.appId)).size !== recentGames.length)
  )
    throw new ProviderSchemaMismatchError("steam.recent");
  const total = libraryGames.reduce((sum, game) => sum + (game.playtimeMinutes ?? 0), 0);
  if (!Number.isSafeInteger(total)) throw new ProviderSchemaMismatchError("steam.library");
  const knownPlaytime = libraryGames.every((game) => game.playtimeMinutes !== null);
  const knownGameCount = libraryGames.filter((game) => game.playtimeMinutes !== null).length;
  let badges: SteamBadges | SteamUnavailable = unavailable("not_synced");
  if (sources.has("steam.badges")) {
    const badgeRaw = object(sources.get("steam.badges"), "steam.badges");
    const hidden = restricted(badgeRaw);
    if (hidden) badges = hidden;
    else {
      // Revalidate stored evidence on replay, not only live network responses.
      const sanitized = sanitizeBadges({ response: badgeRaw });
      const items = sanitized.badges;
      if (!Array.isArray(items)) throw new ProviderSchemaMismatchError("steam.badges");
      badges = {
        availability: "available",
        playerLevel: nullableInteger(sanitized.player_level, "steam.badges"),
        playerXp: nullableInteger(sanitized.player_xp, "steam.badges"),
        xpNeededToLevelUp: nullableInteger(sanitized.player_xp_needed_to_level_up, "steam.badges"),
        xpNeededForCurrentLevel: nullableInteger(
          sanitized.player_xp_needed_current_level,
          "steam.badges"
        ),
        items: items.map((item) => {
          const badge = object(item, "steam.badges");
          return {
            badgeId: integer(badge.badgeid, "steam.badges"),
            appId: nullableInteger(badge.appid, "steam.badges"),
            level: integer(badge.level, "steam.badges"),
            xp: nullableInteger(badge.xp, "steam.badges"),
            completedAt: timestamp(badge.completion_time, "steam.badges"),
            borderColor: nullableInteger(badge.border_color, "steam.badges"),
            scarcity: nullableInteger(badge.scarcity, "steam.badges")
          };
        })
      };
    }
  }
  if (account.visibility !== 3) badges = unavailable("private");
  function coverage(
    hidden: SteamUnavailable | null,
    collectedCount: number,
    reportedCount: number
  ): SteamCoverage {
    return hidden
      ? { status: "unavailable", collectedCount: 0, reportedCount: null, reason: hidden.reason }
      : {
          status: collectedCount === reportedCount ? "complete" : "partial",
          collectedCount,
          reportedCount,
          reason: collectedCount === reportedCount ? null : "legacy_recent_limit"
        };
  }
  const privateProfile = account.visibility === 3 ? null : unavailable("private");
  const achievements = normalizeAchievements(sources.get("steam.achievements"));
  const knownIds = new Set([...libraryGames, ...recentGames].map((game) => game.appId));
  if (
    achievements.games.some((game) => !knownIds.has(game.appId)) ||
    (!libraryUnavailable &&
      !privateProfile &&
      achievements.candidateCount !== null &&
      achievements.candidateCount !== knownIds.size)
  )
    throw new ProviderSchemaMismatchError("steam.achievements");
  if (privateProfile) {
    achievements.games = [];
    achievements.candidateCount = null;
  }
  const availableAchievements = achievements.games.filter(
    (game) => game.availability === "available"
  ).length;
  return {
    provider: "steam",
    account,
    accountDetails: {
      createdAt: timestamp(raw.timecreated, "steam.profile"),
      lastLogoffAt: timestamp(raw.lastlogoff, "steam.profile"),
      currentGame:
        typeof raw.gameid === "string" && /^\d{1,20}$/.test(raw.gameid)
          ? {
              gameId: raw.gameid,
              name: raw.gameextrainfo == null ? null : text(raw.gameextrainfo, "steam.profile")
            }
          : null
    },
    badges,
    achievements,
    coverage: {
      library: coverage(
        privateProfile ?? libraryUnavailable,
        libraryGames.length,
        libraryUnavailable ? 0 : integer(libraryRaw.game_count, "steam.library")
      ),
      recentGames: coverage(
        privateProfile ?? recentUnavailable,
        recentGames.length,
        recentUnavailable ? 0 : integer(recentRaw.total_count, "steam.recent")
      ),
      badges: coverage(
        badges.availability === "unavailable" ? badges : null,
        badges.availability === "available" ? badges.items.length : 0,
        badges.availability === "available" ? badges.items.length : 0
      ),
      achievements: privateProfile
        ? { status: "unavailable", collectedCount: 0, reportedCount: null, reason: "private" }
        : !sources.has("steam.achievements")
          ? {
              status: "not_collected",
              collectedCount: 0,
              reportedCount: null,
              reason: "legacy_snapshot"
            }
          : {
              status:
                achievements.candidateCount !== null &&
                availableAchievements === achievements.candidateCount
                  ? "complete"
                  : "partial",
              collectedCount: availableAchievements,
              reportedCount: achievements.candidateCount,
              reason:
                achievements.candidateCount !== null &&
                availableAchievements === achievements.candidateCount
                  ? null
                  : "request_budget_or_unavailable_games"
            },
      inventory: {
        status: "not_collected",
        collectedCount: 0,
        reportedCount: null,
        reason: "outside_public_profile_scope"
      },
      wishlist: {
        status: "not_collected",
        collectedCount: 0,
        reportedCount: null,
        reason: "outside_public_profile_scope"
      }
    },
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
            unplayedGameCount: knownPlaytime
              ? libraryGames.filter((game) => game.playtimeMinutes === 0).length
              : null,
            playtimeCoverage: {
              knownGameCount,
              unknownGameCount: libraryGames.length - knownGameCount,
              knownMinutes: total
            },
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
