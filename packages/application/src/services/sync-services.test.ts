import {
  PermanentProviderError,
  ProjectionError,
  ProviderNotConfiguredError,
  RawSnapshotSanitizationError,
  RetryableProviderError
} from "@nivalis/domain";
import type {
  BuiltWidgetProjection,
  NormalizedProviderData,
  OwnerContext,
  ProviderConnection,
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
    { create: () => "00000000-0000-4000-8000-000000000800", hashPayload: () => "hash" },
    { now: () => now },
    3,
    120_000
  );
}

function runtimeThatThrows(error: Error): ProviderRuntimeModule {
  return {
    connector: {
      provider: "fixture",
      async fetch() {
        throw error;
      }
    },
    normalizer: {
      provider: "fixture",
      async normalize() {
        throw new Error("not reached");
      }
    },
    projector: {
      provider: "fixture",
      async project() {
        throw new Error("not reached");
      }
    },
    provider: "fixture"
  };
}

function runtimeWithPayload(payload: Record<string, string>): ProviderRuntimeModule {
  return {
    connector: {
      provider: "fixture",
      async fetch() {
        return [
          {
            fetchedAt: now,
            payload,
            schemaVersion: 1,
            sourceKind: "fixture.dashboard"
          }
        ];
      }
    },
    normalizer: {
      provider: "fixture",
      async normalize(snapshots): Promise<NormalizedProviderData> {
        return {
          payload,
          provider: "fixture",
          schemaVersion: 1,
          sourceSnapshotIds: { "fixture.dashboard": snapshots[0]!.id }
        };
      }
    },
    projector: {
      provider: "fixture",
      async project(_normalized, targets): Promise<readonly BuiltWidgetProjection[]> {
        return targets.map((target) => ({
          data: { stars: 1 },
          projectionKey: target.projectionKey,
          projectionSchemaVersion: target.schemaVersion,
          widgetId: target.id
        }));
      }
    },
    provider: "fixture"
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
