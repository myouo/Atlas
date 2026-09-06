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

/** Owner-only detail. Public cards deliberately retain the smaller v2 contract. */
export type SteamDetailedGame = SteamGame & {
  readonly nameSource: "steam" | "app_id";
  readonly lastPlayedAt: string | null;
  readonly hasCommunityVisibleStats: boolean | null;
  readonly platformPlaytimeMinutes: {
    readonly windows: number | null;
    readonly mac: number | null;
    readonly linux: number | null;
    readonly steamDeck: number | null;
  };
};

export type SteamCoverage = {
  readonly status: "complete" | "partial" | "unavailable" | "not_collected";
  readonly collectedCount: number;
  readonly reportedCount: number | null;
  readonly reason: string | null;
};

export type SteamBadges = {
  readonly availability: "available";
  readonly playerLevel: number | null;
  readonly playerXp: number | null;
  readonly xpNeededToLevelUp: number | null;
  readonly xpNeededForCurrentLevel: number | null;
  readonly items: readonly {
    readonly badgeId: number;
    readonly appId: number | null;
    readonly level: number;
    readonly xp: number | null;
    readonly completedAt: string | null;
    readonly borderColor: number | null;
    readonly scarcity: number | null;
  }[];
};

export type SteamGameAchievements =
  | {
      readonly appId: number;
      readonly availability: "available";
      readonly totalCount: number;
      readonly unlockedCount: number;
      readonly items: readonly {
        readonly key: string;
        readonly name: string | null;
        readonly unlocked: boolean;
        readonly unlockedAt: string | null;
      }[];
    }
  | {
      readonly appId: number;
      readonly availability: "unavailable";
      readonly reason: "private" | "not_returned" | "temporarily_unavailable" | "schema_mismatch";
    };

export type SteamCatalogData = Omit<SteamNormalizedData, "library" | "recentGames"> & {
  readonly accountDetails: {
    readonly createdAt: string | null;
    readonly lastLogoffAt: string | null;
    readonly currentGame: { readonly gameId: string; readonly name: string | null } | null;
  };
  readonly library:
    | (SteamLibrary & {
        readonly games: readonly SteamDetailedGame[];
        readonly unplayedGameCount: number | null;
        readonly playtimeCoverage: {
          readonly knownGameCount: number;
          readonly unknownGameCount: number;
          readonly knownMinutes: number;
        };
      })
    | SteamUnavailable;
  readonly recentGames:
    | (Omit<SteamRecentGames, "items"> & {
        readonly items: readonly SteamDetailedGame[];
      })
    | SteamUnavailable;
  readonly badges: SteamBadges | SteamUnavailable;
  readonly achievements: {
    readonly scope: "recent_and_most_played";
    readonly requestBudget: number;
    readonly candidateCount: number | null;
    readonly games: readonly SteamGameAchievements[];
  };
  readonly coverage: {
    readonly library: SteamCoverage;
    readonly recentGames: SteamCoverage;
    readonly badges: SteamCoverage;
    readonly achievements: SteamCoverage;
    readonly inventory: SteamCoverage;
    readonly wishlist: SteamCoverage;
  };
};
