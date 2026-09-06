import {
  PermanentProviderError,
  ProviderCredentialError,
  ProviderSchemaMismatchError,
  RetryableProviderError
} from "@nivalis/domain";

const ORIGIN = "https://api.steampowered.com";
const MAX_RESPONSE_BYTES = 5_000_000;

export class SteamClient {
  constructor(
    private readonly timeoutMs = 12_000,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)
  ) {}

  async get(
    method: "profile" | "library" | "recent" | "level" | "badges" | "achievements" | "vanity",
    steamId: string,
    apiKey: string,
    appId?: number
  ): Promise<unknown> {
    const paths = {
      profile: "/ISteamUser/GetPlayerSummaries/v2/",
      library: "/IPlayerService/GetOwnedGames/v1/",
      recent: "/IPlayerService/GetRecentlyPlayedGames/v1/",
      level: "/IPlayerService/GetSteamLevel/v1/",
      badges: "/IPlayerService/GetBadges/v1/",
      achievements: "/ISteamUserStats/GetPlayerAchievements/v1/",
      vanity: "/ISteamUser/ResolveVanityURL/v1/"
    } as const;
    const url = new URL(paths[method], ORIGIN);
    if (method === "profile") url.searchParams.set("steamids", steamId);
    else if (method === "vanity") {
      url.searchParams.set("vanityurl", steamId);
      url.searchParams.set("url_type", "1");
    } else if (method === "achievements") {
      if (appId === undefined || !Number.isSafeInteger(appId) || appId < 1 || appId > 0xffffffff)
        throw new PermanentProviderError("Invalid Steam application ID.");
      url.searchParams.set("steamid", steamId);
      url.searchParams.set("appid", String(appId));
      url.searchParams.set("l", "english");
    } else
      url.searchParams.set(
        "input_json",
        JSON.stringify({
          steamid: steamId,
          ...(method === "library"
            ? { include_appinfo: true, include_played_free_games: true }
            : {}),
          // Steam documents 0 as all recent games, not an arbitrary UI-sized slice.
          ...(method === "recent" ? { count: 0 } : {})
        })
      );
    // Keep the key out of URLs, Raw evidence, redirects and error messages.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        headers: { accept: "application/json", "x-webapi-key": apiKey },
        method: "GET",
        redirect: "manual",
        signal: controller.signal
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 300 && response.status < 400)
          throw new PermanentProviderError("Steam redirects are not allowed.");
        if (response.status === 429 || response.status >= 500) {
          const delay = Number(response.headers.get("retry-after"));
          throw new RetryableProviderError(
            "Steam is temporarily unavailable.",
            "steam-temporarily-unavailable",
            Number.isFinite(delay) && delay > 0 ? Math.min(delay * 1000, 300_000) : null
          );
        }
        if (response.status === 401 || response.status === 403) {
          if (method !== "profile" && method !== "vanity")
            return { response: {}, restricted: true };
          throw new ProviderCredentialError("invalid", "Steam rejected the Web API key.");
        }
        if (method === "achievements" && (response.status === 400 || response.status === 404))
          return { playerstats: { success: false } };
        throw new PermanentProviderError("Steam could not fulfill the requested read operation.");
      }
      const length = Number(response.headers.get("content-length"));
      if (length > MAX_RESPONSE_BYTES || !response.body) {
        await response.body?.cancel();
        throw new ProviderSchemaMismatchError(`steam.${method}`);
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new ProviderSchemaMismatchError(`steam.${method}`);
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      } catch {
        throw new ProviderSchemaMismatchError(`steam.${method}`);
      }
    } catch (error) {
      if (
        error instanceof PermanentProviderError ||
        error instanceof ProviderCredentialError ||
        error instanceof ProviderSchemaMismatchError ||
        error instanceof RetryableProviderError
      )
        throw error;
      throw new RetryableProviderError("Steam request timed out or failed in transport.");
    } finally {
      clearTimeout(timer);
    }
  }
}
