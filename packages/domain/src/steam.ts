export type SteamUnavailable = {
  readonly availability: "unavailable";
  readonly reason: "not_synced" | "private" | "not_returned" | "not_shared";
};

export type SteamAccount = {
  readonly availability: "available";
  readonly steamId: string;
  readonly displayName: string;
  readonly profileUrl: string;
  readonly avatarUrl: string | null;
  readonly personaState: number | null;
  readonly visibility: number;
  readonly level: number | null;
};

export type SteamGame = {
  readonly appId: number;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly storeUrl: string;
  readonly playtimeMinutes: number | null;
  readonly recentPlaytimeMinutes: number | null;
};

export type SteamLibrary = {
  readonly availability: "available";
  readonly gameCount: number;
  readonly playtimeMinutes: number | null;
  readonly playedGameCount: number | null;
};

export type SteamRecentGames = {
  readonly availability: "available";
  readonly totalCount: number;
  readonly items: readonly SteamGame[];
};

export type SteamProfileData = {
  readonly provider: "steam";
  readonly account: SteamAccount | SteamUnavailable;
  readonly library: SteamLibrary | SteamUnavailable;
  readonly recentGames: SteamRecentGames | SteamUnavailable;
};

export type SteamNormalizedData = {
  readonly provider: "steam";
  readonly account: SteamAccount;
  readonly library: (SteamLibrary & { readonly games: readonly SteamGame[] }) | SteamUnavailable;
  readonly recentGames: SteamRecentGames | SteamUnavailable;
};
