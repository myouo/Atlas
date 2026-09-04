import type {
  BuiltWidgetProjection,
  ProviderConnection,
  ProviderSyncState,
  ProviderType,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";

export interface CreateSyncRunResult {
  readonly created: boolean;
  readonly run: SyncRun;
}

export interface RawSnapshotInput {
  readonly fetchedAt: Date;
  readonly payload: import("@nivalis/domain").JsonValue;
  readonly payloadHash: string;
  readonly provider: ProviderType;
  readonly providerConnectionId: string;
  readonly schemaVersion: number;
  readonly sourceKind: string;
  readonly sourceCursor?: string;
  readonly sourceTimestamp?: Date;
  readonly syncRunId: string;
}

export interface CompleteSyncInput {
  readonly generatedAt: Date;
  readonly projections: readonly BuiltWidgetProjection[];
  readonly providerConnectionId: string;
  readonly provider: ProviderType;
  readonly projectionVersionId: string;
  readonly sourceSnapshotId: string;
  readonly syncRunId: string;
}

export interface NormalizedProviderSnapshotInput {
  readonly generatedAt: Date;
  readonly normalized: import("@nivalis/domain").NormalizedProviderData;
  readonly provider: ProviderType;
  readonly providerConnectionId: string;
  readonly syncRunId: string;
}

export type CommitProjectionReplayInput = Omit<CompleteSyncInput, "syncRunId">;

export interface SyncRepository {
  attachQueueJob(syncRunId: string, queueJobId: string, now: Date): Promise<SyncRun>;
  claimRun(syncRunId: string, now: Date, staleBefore: Date): Promise<SyncRun | null>;
  completeRun(input: CompleteSyncInput): Promise<SyncRun>;
  createOrGetActiveRun(connection: ProviderConnection, now: Date): Promise<CreateSyncRunResult>;
  findConnectionForOwnerProvider(
    ownerId: string,
    provider: ProviderType
  ): Promise<ProviderConnection | null>;
  getConnection(providerConnectionId: string): Promise<ProviderConnection | null>;
  getRun(syncRunId: string): Promise<SyncRun | null>;
  getRunForOwner(ownerId: string, syncRunId: string): Promise<SyncRun | null>;
  getPreviousNormalizedData(
    providerConnectionId: string,
    syncRunId: string
  ): Promise<import("@nivalis/domain").NormalizedProviderData | null>;
  insertNormalizedSnapshot(input: NormalizedProviderSnapshotInput): Promise<void>;
  insertRawSnapshot(input: RawSnapshotInput, now: Date): Promise<RawSnapshot>;
  getRawSnapshot(snapshotId: string): Promise<RawSnapshot | null>;
  listRawSnapshotsForRun(syncRunId: string): Promise<readonly RawSnapshot[]>;
  commitProjectionReplay(input: CommitProjectionReplayInput): Promise<void>;
  listProviderStates(ownerId: string): Promise<readonly ProviderSyncState[]>;
  markCredentialStatus(
    providerConnectionId: string,
    status: "expired" | "invalid" | "valid",
    now: Date
  ): Promise<void>;
  markFailed(
    syncRunId: string,
    errorCode: string,
    errorMessage: string,
    now: Date
  ): Promise<SyncRun>;
  markRetryWait(
    syncRunId: string,
    errorCode: string,
    errorMessage: string,
    now: Date
  ): Promise<SyncRun>;
}

export interface SyncJobQueue {
  enqueue(syncRunId: string): Promise<string>;
}

export interface SyncEnqueueUnitOfWork {
  run<T>(work: (repository: SyncRepository, queue: SyncJobQueue) => Promise<T>): Promise<T>;
}

export interface SyncUnitOfWork {
  run<T>(
    work: (repository: SyncRepository, nativeStores: ProviderNativeStoreRegistry) => Promise<T>
  ): Promise<T>;
}

export interface ProviderNativeStore {
  readonly provider: ProviderType;
  persist(input: {
    readonly generatedAt: Date;
    readonly normalized: import("@nivalis/domain").NormalizedProviderData;
    readonly providerConnectionId: string;
  }): Promise<void>;
}

export interface ProviderNativeStoreRegistry {
  get(provider: ProviderType): ProviderNativeStore | null;
}

export interface ProviderRuntimeRegistry {
  get(provider: ProviderType): import("@nivalis/domain").ProviderRuntimeModule | null;
}

export interface SyncIdentityFactory {
  create(): string;
  hashPayload(payload: import("@nivalis/domain").JsonValue): string;
}
