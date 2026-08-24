import type { JsonObject, JsonValue } from "./json";
import type { ProviderType, WidgetConfiguration, WidgetType } from "./dashboard";

export type SyncRunStatus = "queued" | "running" | "retry_wait" | "completed" | "failed";
export type ProviderRawSourceKind = string;

export interface ProviderConnection {
  readonly accountKey: string;
  readonly enabled: boolean;
  readonly id: string;
  readonly ownerId: string;
  readonly provider: ProviderType;
}

export interface SyncRun {
  readonly attemptCount: number;
  readonly finishedAt: Date | null;
  readonly id: string;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly provider: ProviderType;
  readonly providerConnectionId: string;
  readonly queueJobId: string | null;
  readonly requestedAt: Date;
  readonly startedAt: Date | null;
  readonly status: SyncRunStatus;
}

export interface ProviderSyncState {
  readonly attemptCount: number;
  readonly connectionEnabled: boolean;
  readonly credentialStatus: import("./credentials").CredentialStatus;
  readonly lastAttemptAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastSuccessAt: Date | null;
  readonly lastSuccessfulRunId: string | null;
  readonly provider: ProviderType;
  readonly providerConnectionId: string;
  readonly status: "idle" | "credential_invalid" | SyncRunStatus;
}

export interface RawSnapshot {
  readonly createdAt: Date;
  readonly fetchedAt: Date;
  readonly id: string;
  readonly payload: JsonValue;
  readonly payloadHash: string;
  readonly provider: ProviderType;
  readonly providerConnectionId: string;
  readonly schemaVersion: number;
  readonly sourceKind: ProviderRawSourceKind;
  readonly sourceCursor: string | null;
  readonly sourceTimestamp: Date | null;
  readonly syncRunId: string;
}

export interface ProjectionTarget extends WidgetConfiguration {
  readonly projectionKey: string;
}

export interface BuiltWidgetProjection {
  readonly data: JsonValue;
  readonly projectionKey: string;
  readonly projectionSchemaVersion: number;
  readonly sourceSnapshotId?: string | null;
  readonly widgetId: string;
}

export interface StoredWidgetProjection extends BuiltWidgetProjection {
  readonly generatedAt: Date;
  readonly lastSuccessAt: Date;
  readonly projectionVersionId: string;
  readonly provider: ProviderType;
  readonly providerConnectionId: string | null;
  readonly sourceSnapshotId: string | null;
  readonly stale: boolean;
}

export interface ProviderFetchResult {
  readonly fetchedAt: Date;
  readonly payload: JsonValue;
  readonly schemaVersion: number;
  readonly sourceKind: ProviderRawSourceKind;
  readonly sourceCursor?: string;
  readonly sourceTimestamp?: Date;
}

export interface NormalizedProviderData {
  readonly payload: JsonObject;
  readonly provider: ProviderType;
  readonly schemaVersion: number;
  readonly sourceSnapshotIds: Readonly<Record<string, string>>;
}

export interface ProviderConnector {
  readonly provider: ProviderType;
  fetch(run: SyncRun): Promise<readonly ProviderFetchResult[]>;
}

export interface ProviderNormalizer {
  readonly provider: ProviderType;
  normalize(snapshots: readonly RawSnapshot[]): Promise<NormalizedProviderData>;
}

export interface ProviderProjector {
  readonly provider: ProviderType;
  project(
    normalized: NormalizedProviderData,
    targets: readonly ProjectionTarget[]
  ): Promise<readonly BuiltWidgetProjection[]>;
}

export interface ProviderRuntimeModule {
  readonly connector: ProviderConnector;
  readonly normalizer: ProviderNormalizer;
  readonly projector: ProviderProjector;
  readonly provider: ProviderType;
}

export interface ProjectionIdentityInput {
  readonly dataConfig: JsonObject;
  readonly schemaVersion: number;
  readonly type: WidgetType;
}
