export type ProviderType = "netease" | "github" | "bilibili" | "steam" | "bangumi";

export type WidgetType =
  | "profile.hero"
  | "system.stats"
  | "music.netease.overview"
  | "github.profile"
  | "bilibili.profile"
  | "steam.profile"
  | "bangumi.collection";

export interface DashboardRevisionIdentity {
  readonly dashboardId: string;
  readonly revision: number;
}

export interface ProviderSyncJobIdentity {
  readonly jobId: string;
  readonly provider: ProviderType;
}
