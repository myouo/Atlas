import type {
  AuthSession,
  DashboardReadModel,
  DashboardRevisionDetail,
  DashboardRevisionList,
  DashboardState,
  Provider,
  ProviderAuthAttempt,
  ProviderConnectAccepted,
  ProviderConnection,
  ProviderStatus,
  ResponsiveLayout,
  SyncJob,
  WidgetProjection
} from "@nivalis/api-client";

export type DashboardSourceKind = "api" | "mock";
export type DashboardConcurrencyToken = string;

export type HydratedDashboardState = Omit<DashboardState, "widgets"> & {
  readonly widgets: readonly WidgetProjection[];
};

export interface DashboardEditableDraft {
  readonly layout: ResponsiveLayout;
  readonly widgets: readonly WidgetProjection[];
}

export interface DashboardProjectionRefresh {
  readonly draftWidgets: readonly WidgetProjection[];
  readonly providerStatuses: readonly ProviderStatus[];
  readonly published: DashboardReadModel;
}

export interface VersionedDashboardState {
  readonly concurrencyToken: DashboardConcurrencyToken;
  readonly dashboard: HydratedDashboardState;
}

export interface LoadedDashboardState {
  readonly draft: VersionedDashboardState | null;
  readonly providerStatuses: readonly ProviderStatus[];
  readonly published: DashboardReadModel;
  readonly session: AuthSession;
}

export interface DashboardDataSource {
  readonly kind: DashboardSourceKind;
  getAuthSession(): Promise<AuthSession>;
  connectNetease(credential: string): Promise<ProviderConnectAccepted>;
  cancelNeteaseAuthAttempt(attemptId: string): Promise<void>;
  disconnectNetease(): Promise<void>;
  getNeteaseConnection(): Promise<ProviderConnection>;
  getNeteaseAuthAttempt(attemptId: string): Promise<ProviderAuthAttempt>;
  getProviderConnections(): Promise<readonly ProviderConnection[]>;
  logout(): Promise<void>;
  startAuthentication(): Promise<{ readonly authorizationUrl: string }>;
  startNeteaseQrAuth(): Promise<ProviderAuthAttempt>;
  startNeteaseSmsAuth(phone: string, countryCode: string): Promise<ProviderAuthAttempt>;
  verifyNeteaseSmsAuth(attemptId: string, code: string): Promise<ProviderAuthAttempt>;
  enqueueProviderSync(provider: Provider): Promise<SyncJob>;
  getSyncJob(jobId: string): Promise<SyncJob>;
  getRevision(revisionId: string): Promise<DashboardRevisionDetail>;
  listRevisions(options?: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<DashboardRevisionList>;
  load(): Promise<LoadedDashboardState>;
  publishDraft(
    input: DashboardEditableDraft,
    concurrencyToken: DashboardConcurrencyToken
  ): Promise<VersionedDashboardState>;
  restoreRevision(
    revisionId: string,
    concurrencyToken: DashboardConcurrencyToken
  ): Promise<VersionedDashboardState>;
  refreshProjections(): Promise<DashboardProjectionRefresh>;
  saveDraft(
    input: DashboardEditableDraft,
    concurrencyToken: DashboardConcurrencyToken
  ): Promise<VersionedDashboardState>;
}

export interface RevisionConflictState {
  readonly currentConcurrencyToken: DashboardConcurrencyToken;
  readonly currentRevisionId: string;
  readonly currentRevisionNumber: number;
}

export class RevisionConflictError extends Error implements RevisionConflictState {
  constructor(
    readonly currentConcurrencyToken: DashboardConcurrencyToken,
    readonly currentRevisionId: string,
    readonly currentRevisionNumber: number
  ) {
    super("The Dashboard Draft changed in another client.");
    this.name = "RevisionConflictError";
  }
}
