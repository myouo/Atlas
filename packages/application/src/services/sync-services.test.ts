import {
  PermanentProviderError,
  ProjectionError,
  PROVIDER_JSON_MEDIA_TYPE,
  providerNormalizedSchemaId,
  providerProtocolMetadata,
  providerSourceSchemaId,
  ProviderNotConfiguredError,
  ProviderProtocolError,
  RawSnapshotSanitizationError,
  RetryableProviderError
} from "@nivalis/domain";
import type {
  JsonObject,
  NormalizedProviderData,
  OwnerContext,
  ProviderConnection,
  ProviderCollection,
  ProviderCollectionResult,
  ProviderRuntimeModule,
  ProviderSyncState,
  ProviderType,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectionRepository } from "../ports/projection-repository";
import type {
  CompleteSyncInput,
  ProviderNativeStoreRegistry,
  RawSnapshotInput,
  SyncEnqueueUnitOfWork,
  SyncJobQueue,
  SyncRepository,
  SyncUnitOfWork
} from "../ports/sync-runtime";
import { SyncService } from "./sync-service";
import { SyncWorkerService } from "./sync-worker-service";

const now = new Date("2026-08-24T01:00:00.000Z");
const owner: OwnerContext = {
  actorId: "00000000-0000-4000-8000-000000000001"
};
const connection: ProviderConnection = {
  accountKey: "development-fixture",
  enabled: true,
  id: "00000000-0000-4000-8000-000000000400",
  ownerId: owner.actorId,
  provider: "fixture"
};

describe("SyncService", () => {
  let repository: FakeSyncRepository;
  let queue: FakeQueue;
  let service: SyncService;

  beforeEach(() => {
    repository = new FakeSyncRepository();
    queue = new FakeQueue();
    service = new SyncService(repository, new FakeEnqueueUnitOfWork(repository, queue), {
      now: () => now
    });
  });

  it("creates one Nivalis SyncRun and keeps the pg-boss id as infrastructure metadata", async () => {
    const run = await service.enqueue(owner, "fixture");
    expect(run.id).toBe(runId);
    expect(run.queueJobId).toBe("pg-boss-internal-id");
    expect(queue.enqueue).toHaveBeenCalledOnce();

    const duplicate = await service.enqueue(owner, "fixture");
    expect(duplicate.id).toBe(run.id);
    expect(queue.enqueue).toHaveBeenCalledOnce();
  });

  it("rejects unconfigured Providers", async () => {
    await expect(service.enqueue(owner, "github")).rejects.toBeInstanceOf(
      ProviderNotConfiguredError
    );
  });

  it("honors composition-root Provider availability", async () => {
    const disabled = new SyncService(
      repository,
      new FakeEnqueueUnitOfWork(repository, queue),
      { now: () => now },
      (provider) => provider !== "fixture"
    );
    await expect(disabled.enqueue(owner, "fixture")).rejects.toBeInstanceOf(
      ProviderNotConfiguredError
    );
    expect(
      (await disabled.listProviderStatus(owner)).find((status) => status.provider === "fixture")
    ).toBeUndefined();
  });
});

describe("SyncWorkerService", () => {
  let repository: FakeSyncRepository;

  beforeEach(() => {
    repository = new FakeSyncRepository();
    repository.run = { ...baseRun(), status: "queued" };
  });

  it("classifies transient Provider failures for bounded queue retry", async () => {
    const worker = createWorker(
      repository,
      runtimeThatThrows(new RetryableProviderError("timeout"))
    );
    await expect(worker.process(runId)).rejects.toBeInstanceOf(RetryableProviderError);
    expect(repository.run).toMatchObject({ attemptCount: 1, status: "retry_wait" });
  });

  it("fails permanently without retry and retains the previous projection", async () => {
    const previous = repository.projectionVersion;
    const worker = createWorker(
      repository,
      runtimeThatThrows(new PermanentProviderError("unauthorized"))
    );
    await expect(worker.process(runId)).resolves.toMatchObject({ status: "failed" });
    expect(repository.run.attemptCount).toBe(1);
    expect(repository.projectionVersion).toBe(previous);
  });

  it("rejects credential-like Raw Snapshot keys before persistence", async () => {
    const worker = createWorker(
      repository,
      runtimeWithPayload({ provider_cookie: "must-not-persist" })
    );
    await expect(worker.process(runId)).resolves.toMatchObject({ status: "failed" });
    expect(repository.rawSnapshots).toHaveLength(0);
    expect(repository.run.lastErrorCode).toBe(new RawSnapshotSanitizationError("x").code);
  });

  it("fails closed when a runtime emits another Provider's protocol envelope", async () => {
    const runtime = runtimeWithPayload({ kind: "fixture" });
    const collect = runtime.connector.collect;
    runtime.connector.collect = async (request) => {
      const result = await collect(request);
      if (!isCollectionResult(result)) return result;
      return {
        ...result,
        meta: providerProtocolMetadata("collection.result", "netease", request.data.runId)
      };
    };
    await expect(createWorker(repository, runtime).process(runId)).resolves.toMatchObject({
      status: "failed"
    });
    expect(repository.rawSnapshots).toHaveLength(0);
    expect(repository.run.lastErrorCode).toBe(new ProviderProtocolError("x").code);
  });

  it("keeps Raw Snapshot evidence and Last Known Good Projection when projection fails", async () => {
    const runtime = runtimeWithPayload({ kind: "fixture" });
    runtime.projector.project = async () => {
      throw new ProjectionError("projector failed");
    };
    const previous = repository.projectionVersion;
    await expect(createWorker(repository, runtime).process(runId)).resolves.toMatchObject({
      status: "failed"
    });
    expect(repository.rawSnapshots).toHaveLength(1);
    expect(repository.projectionVersion).toBe(previous);
  });

  it("commits an immutable normalized snapshot with a successful projection", async () => {
    const completed = await createWorker(
      repository,
      runtimeWithPayload({ kind: "fixture" })
    ).process(runId);
    expect(completed.status).toBe("completed");
    expect(repository.normalizedSnapshots).toHaveLength(1);
    expect(repository.normalizedSnapshots[0]?.meta).toMatchObject({
      kind: "normalization.result",
      protocolVersion: "2.0",
      schemaVersion: 1
    });
  });

  it("feeds the prior normalized checkpoint and state into incremental materialization", async () => {
    const base = runtimeWithPayload({ kind: "fixture" });
    const runtime: ProviderRuntimeModule = {
      ...base,
      manifest: {
        ...base.manifest,
        data: {
          ...base.manifest.data,
          capabilities: {
            ...base.manifest.data.capabilities,
            collectionModes: ["snapshot", "incremental"]
          },
          sources: [
            {
              ...base.manifest.data.sources[0]!,
              operations: ["replace", "upsert", "delete"]
            }
          ]
        }
      }
    };
    const previous = previousNormalizedFixture();
    repository.normalizedSnapshots.push(previous);
    let requestedCheckpoint: JsonObject | null = null;
    let normalizationPrevious: NormalizedProviderData | null = null;
    runtime.connector.collect = async (request) => {
      requestedCheckpoint = request.data.checkpoint;
      return {
        data: {
          checkpoint: { sequence: "2" },
          continuation: null,
          issues: [],
          mode: "incremental",
          outcome: "complete",
          records: [
            {
              data: { kind: "fixture" },
              meta: {
                ...providerProtocolMetadata("source.record", "fixture", request.data.runId),
                collectedAt: now.toISOString(),
                mediaType: PROVIDER_JSON_MEDIA_TYPE,
                operation: "upsert",
                partition: { kind: "singleton" },
                payloadKind: "json",
                schemaId: providerSourceSchemaId("fixture", "fixture.dashboard"),
                schemaVersion: 1,
                source: "fixture.dashboard",
                sourceUpdatedAt: null
              }
            }
          ]
        },
        meta: providerProtocolMetadata("collection.result", "fixture", request.data.runId)
      };
    };
    const normalize = runtime.normalizer.normalize;
    runtime.normalizer.normalize = async (input) => {
      normalizationPrevious = input.data.previous;
      return normalize(input);
    };

    await expect(createWorker(repository, runtime).process(runId)).resolves.toMatchObject({
      status: "completed"
    });
    expect(requestedCheckpoint).toEqual({ sequence: "1" });
    expect(normalizationPrevious).toBe(previous);
    expect(repository.normalizedSnapshots).toHaveLength(2);
  });
});

const runId = "00000000-0000-4000-8000-000000000500";

class FakeQueue implements SyncJobQueue {
  readonly enqueue = vi.fn(async () => "pg-boss-internal-id");
}

class FakeEnqueueUnitOfWork implements SyncEnqueueUnitOfWork {
  constructor(
    private readonly repository: SyncRepository,
    private readonly queue: SyncJobQueue
  ) {}

  run<T>(work: (repository: SyncRepository, queue: SyncJobQueue) => Promise<T>): Promise<T> {
    return work(this.repository, this.queue);
  }
}

class FakeSyncRepository implements SyncRepository {
  run: SyncRun = baseRun();
  active = false;
  projectionVersion = "last-known-good";
  readonly rawSnapshots: RawSnapshot[] = [];
  readonly normalizedSnapshots: NormalizedProviderData[] = [];

  async findConnectionForOwnerProvider(_ownerId: string, provider: ProviderType) {
    return provider === "fixture" ? connection : null;
  }

  async getConnection() {
    return connection;
  }

  async createOrGetActiveRun() {
    if (this.active) return { created: false, run: this.run };
    this.active = true;
    this.run = baseRun();
    return { created: true, run: this.run };
  }

  async attachQueueJob(_syncRunId: string, queueJobId: string) {
    this.run = { ...this.run, queueJobId };
    return this.run;
  }

  async getRun() {
    return this.run;
  }

  async getRunForOwner() {
    return this.run;
  }

  async claimRun() {
    if (!(["queued", "retry_wait"] as const).includes(this.run.status as "queued" | "retry_wait")) {
      return null;
    }
    this.run = {
      ...this.run,
      attemptCount: this.run.attemptCount + 1,
      startedAt: this.run.startedAt ?? now,
      status: "running"
    };
    return this.run;
  }

  async insertRawSnapshot(input: RawSnapshotInput, createdAt: Date) {
    const snapshot: RawSnapshot = {
      createdAt,
      fetchedAt: input.fetchedAt,
      id: "00000000-0000-4000-8000-000000000600",
      payload: input.payload,
      payloadHash: input.payloadHash,
      provider: input.provider,
      providerConnectionId: input.providerConnectionId,
      schemaVersion: input.schemaVersion,
      sourceKind: input.sourceKind,
      sourceCursor: input.sourceCursor ?? null,
      sourceTimestamp: input.sourceTimestamp ?? null,
      syncRunId: input.syncRunId
    };
    this.rawSnapshots.push(snapshot);
    return snapshot;
  }

  async getRawSnapshot(snapshotId: string) {
    return this.rawSnapshots.find((snapshot) => snapshot.id === snapshotId) ?? null;
  }

  async listRawSnapshotsForRun(syncRunId: string) {
    return this.rawSnapshots.filter((snapshot) => snapshot.syncRunId === syncRunId);
  }

  async getPreviousNormalizedData() {
    return this.normalizedSnapshots.at(-1) ?? null;
  }

  async insertNormalizedSnapshot(input: { normalized: NormalizedProviderData }) {
    this.normalizedSnapshots.push(input.normalized);
  }

  async commitProjectionReplay(input: Omit<CompleteSyncInput, "syncRunId">) {
    this.projectionVersion = input.projectionVersionId;
  }

  async completeRun(input: CompleteSyncInput) {
    this.projectionVersion = input.projectionVersionId;
    this.run = { ...this.run, finishedAt: input.generatedAt, status: "completed" };
    return this.run;
  }

  async listProviderStates(): Promise<readonly ProviderSyncState[]> {
    return [];
  }

  async markCredentialStatus() {
    await Promise.resolve();
  }

  async markRetryWait(_syncRunId: string, errorCode: string, errorMessage: string) {
    void _syncRunId;
    this.run = {
      ...this.run,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      status: "retry_wait"
    };
    return this.run;
  }

  async markFailed(_syncRunId: string, errorCode: string, errorMessage: string, finishedAt: Date) {
    this.run = {
      ...this.run,
      finishedAt,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      status: "failed"
    };
    return this.run;
  }
}

class FakeSyncUnitOfWork implements SyncUnitOfWork {
  constructor(private readonly repository: SyncRepository) {}

  run<T>(
    work: (repository: SyncRepository, nativeStores: ProviderNativeStoreRegistry) => Promise<T>
  ): Promise<T> {
    return work(this.repository, { get: () => null });
  }
}

const projections: ProjectionRepository = {
  async hydrateWidgets() {
    throw new Error("not used");
  },
  async listActiveTargets() {
    return [
      {
        dataConfig: {},
        enabled: true,
        id: "00000000-0000-4000-8000-000000000700",
        presentationConfig: {},
        provider: "fixture",
        projectionKey: "a".repeat(64),
        schemaVersion: 1,
        title: "GitHub",
        type: "github.profile"
      }
    ];
  },
  async getStoredProjections() {
    return [];
  }
};

function createWorker(repository: FakeSyncRepository, runtime: ProviderRuntimeModule) {
  return new SyncWorkerService(
    new FakeSyncUnitOfWork(repository),
    projections,
    { get: (provider) => (provider === "fixture" ? runtime : null) },
    {
      create: () => "00000000-0000-4000-8000-000000000800",
      hashPayload: () => "a".repeat(64)
    },
    { now: () => now },
    3,
    120_000
  );
}

function runtimeThatThrows(error: Error): ProviderRuntimeModule {
  return {
    connector: {
      async collect() {
        throw error;
      }
    },
    manifest: fixtureManifest(),
    normalizer: {
      async normalize() {
        throw new Error("not reached");
      }
    },
    projector: {
      async project() {
        throw new Error("not reached");
      }
    }
  };
}

function runtimeWithPayload(payload: Record<string, string>): ProviderRuntimeModule {
  return {
    connector: {
      async collect(request) {
        return {
          data: {
            checkpoint: null,
            continuation: null,
            issues: [],
            mode: "snapshot",
            outcome: "complete",
            records: [
              {
                data: payload,
                meta: {
                  ...providerProtocolMetadata("source.record", "fixture", request.data.runId),
                  collectedAt: now.toISOString(),
                  mediaType: PROVIDER_JSON_MEDIA_TYPE,
                  operation: "replace",
                  partition: { kind: "singleton" },
                  payloadKind: "json",
                  schemaId: providerSourceSchemaId("fixture", "fixture.dashboard"),
                  schemaVersion: 1,
                  source: "fixture.dashboard",
                  sourceUpdatedAt: null
                }
              }
            ]
          },
          meta: providerProtocolMetadata("collection.result", "fixture", request.data.runId)
        };
      }
    },
    manifest: fixtureManifest(),
    normalizer: {
      async normalize(input): Promise<NormalizedProviderData> {
        return {
          data: payload,
          meta: {
            ...providerProtocolMetadata(
              "normalization.result",
              "fixture",
              input.meta.correlationId
            ),
            checkpoint: input.data.checkpoint,
            issues: input.data.issues,
            outcome: input.data.collectionOutcome,
            schemaId: providerNormalizedSchemaId("fixture"),
            schemaVersion: 1,
            sourceSnapshots: [
              {
                partition: input.data.records[0]!.meta.partition,
                snapshotId: input.data.records[0]!.meta.snapshotId,
                source: "fixture.dashboard"
              }
            ]
          }
        };
      }
    },
    projector: {
      async project(input) {
        return {
          data: input.data.targets.map((target) => ({
            data: { stars: 1 },
            projectionKey: target.projectionKey,
            projectionSchemaVersion: target.schemaVersion,
            widgetId: target.id
          })),
          meta: {
            ...providerProtocolMetadata("projection.result", "fixture", input.meta.correlationId),
            issues: input.data.normalized.meta.issues,
            outcome: input.data.normalized.meta.outcome
          }
        };
      }
    }
  };
}

function fixtureManifest() {
  return {
    data: {
      capabilities: {
        collectionModes: ["snapshot" as const],
        continuation: false,
        partialResults: false,
        payloadKinds: ["json" as const]
      },
      displayName: "Fixture",
      extensions: {},
      limits: {
        maxBatchBytes: 10_000,
        maxBatchRecords: 1,
        maxCacheRecords: 0,
        maxCheckpointBytes: 1_000,
        maxCollectionBytes: 10_000,
        maxContinuationBatches: 1,
        maxIssues: 4,
        maxNormalizedBytes: 10_000,
        maxProjectionBytes: 10_000,
        maxRecordBytes: 5_000
      },
      normalizedSchema: {
        acceptedVersions: [1],
        id: providerNormalizedSchemaId("fixture"),
        producedVersion: 1
      },
      sources: [
        {
          criticality: "required" as const,
          dataShape: "document" as const,
          extensions: {},
          id: "fixture.dashboard",
          mediaTypes: [PROVIDER_JSON_MEDIA_TYPE],
          operations: ["replace" as const],
          partitions: ["singleton" as const],
          payloadKinds: ["json" as const],
          schema: {
            acceptedVersions: [1],
            id: providerSourceSchemaId("fixture", "fixture.dashboard"),
            producedVersion: 1
          }
        }
      ]
    },
    meta: providerProtocolMetadata("manifest", "fixture")
  };
}

function isCollectionResult(result: ProviderCollectionResult): result is ProviderCollection {
  return result.meta.kind === "collection.result";
}

function previousNormalizedFixture(): NormalizedProviderData {
  return {
    data: { kind: "fixture" },
    meta: {
      ...providerProtocolMetadata(
        "normalization.result",
        "fixture",
        "00000000-0000-4000-8000-000000000499"
      ),
      checkpoint: { sequence: "1" },
      issues: [],
      outcome: "complete",
      schemaId: providerNormalizedSchemaId("fixture"),
      schemaVersion: 1,
      sourceSnapshots: [
        {
          partition: { kind: "singleton" },
          snapshotId: "00000000-0000-4000-8000-000000000498",
          source: "fixture.dashboard"
        }
      ]
    }
  };
}

function baseRun(): SyncRun {
  return {
    attemptCount: 0,
    finishedAt: null,
    id: runId,
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "fixture",
    providerConnectionId: connection.id,
    queueJobId: null,
    requestedAt: now,
    startedAt: null,
    status: "queued"
  };
}
