import type { JsonObject, JsonValue } from "./json";

export const ABOUT_DASHBOARD_SLUG = "about" as const;
export const DASHBOARD_BREAKPOINT_COLUMNS = { lg: 12, md: 8, sm: 4 } as const;

export type DashboardSlug = typeof ABOUT_DASHBOARD_SLUG;
export type DashboardStateKind = "draft" | "published";
export type DashboardBreakpoint = keyof typeof DASHBOARD_BREAKPOINT_COLUMNS;
export type DashboardRevisionOperation =
  | "initial_migration"
  | "seed"
  | "save"
  | "widget_add"
  | "widget_update"
  | "widget_delete"
  | "restore"
  | "schema_upgrade";

export type ProviderType = "fixture" | "netease" | "github" | "bilibili" | "steam" | "bangumi";

export type WidgetType =
  | "profile.hero"
  | "system.stats"
  | "music.netease.overview"
  | "github.profile"
  | "bilibili.profile"
  | "steam.profile"
  | "bangumi.collection";

export interface Profile extends JsonObject {
  readonly avatarUrl: string;
  readonly bio: string;
  readonly displayName: string;
  readonly handle: string;
  readonly headline: string;
  readonly tags: readonly string[];
}

export interface DashboardLayoutItem {
  readonly h: number;
  readonly i: string;
  readonly w: number;
  readonly x: number;
  readonly y: number;
}

export type ResponsiveLayout = Record<DashboardBreakpoint, readonly DashboardLayoutItem[]>;

export interface WidgetConfiguration {
  readonly dataConfig: JsonObject;
  readonly enabled: boolean;
  readonly id: string;
  readonly presentationConfig: JsonObject;
  readonly provider: ProviderType;
  readonly schemaVersion: number;
  readonly title: string;
  readonly type: WidgetType;
}

export interface WidgetProjection extends WidgetConfiguration {
  readonly data: JsonValue;
  readonly stale: boolean;
  readonly updatedAt: Date;
}

export interface DashboardSnapshot {
  readonly dashboardId: DashboardSlug;
  readonly layout: ResponsiveLayout;
  readonly profile: Profile;
  readonly revision: number;
  readonly revisionId: string;
  readonly state: DashboardStateKind;
  readonly updatedAt: Date;
  readonly widgets: readonly WidgetConfiguration[];
}

export interface DashboardReadModelSnapshot {
  readonly dashboardId: DashboardSlug;
  readonly layout: ResponsiveLayout;
  readonly profile: Profile;
  readonly revision: number;
  readonly revisionId: string;
  readonly updatedAt: Date;
  readonly viewVersion: string;
  readonly widgets: readonly WidgetProjection[];
}

export interface DashboardLiveDataSnapshot {
  readonly configurationRevisionId: string;
  readonly dashboardId: DashboardSlug;
  readonly dataVersion: string;
  readonly generatedAt: Date;
  readonly projectionVersions: readonly WidgetProjectionVersion[];
  readonly widgets: readonly WidgetProjection[];
}

export interface WidgetProjectionVersion {
  readonly projectionKey: string;
  readonly projectionVersion: string | null;
  /** Internal representation input; it is not exposed by the HTTP contract. */
  readonly representationVersion?: string;
  readonly widgetId: string;
}

export interface DashboardRevisionMetadata {
  readonly createdAt: Date;
  readonly isCurrentDraft: boolean;
  readonly isCurrentPublished: boolean;
  readonly operation: DashboardRevisionOperation;
  readonly parentRevisionId: string | null;
  readonly restoredFromRevisionId: string | null;
  readonly revisionId: string;
  readonly revisionNumber: number;
}

export interface DashboardRevisionSnapshot extends DashboardRevisionMetadata {
  readonly dashboardId: DashboardSlug;
  readonly layout: ResponsiveLayout;
  readonly profile: Profile;
  readonly widgets: readonly WidgetConfiguration[];
}

export interface DashboardRevisionPage {
  readonly items: readonly DashboardRevisionMetadata[];
  readonly nextCursorRevisionNumber: number | null;
}

export interface DashboardDraftInput {
  readonly layout: ResponsiveLayout;
  readonly widgets: readonly WidgetConfiguration[];
}

export interface WidgetPlacement {
  readonly lg: DashboardLayoutItem;
  readonly md: DashboardLayoutItem;
  readonly sm: DashboardLayoutItem;
}

export interface OwnerContext {
  readonly actorId: string;
}

export interface ProviderStatus {
  readonly attemptCount: number;
  readonly connection:
    "connected" | "fixture" | "not_connected" | "requires_attention" | "disabled";
  readonly credentialStatus: import("./credentials").CredentialStatus;
  readonly lastAttemptAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastSuccessAt: Date | null;
  readonly provider: ProviderType;
  readonly syncStatus:
    "idle" | "queued" | "running" | "retrying" | "completed" | "failed" | "credential_invalid";
}

export interface DashboardRevisionIdentity {
  readonly revisionId: string;
  readonly revisionNumber: number;
}

export interface ProviderSyncJobIdentity {
  readonly jobId: string;
  readonly provider: ProviderType;
}
