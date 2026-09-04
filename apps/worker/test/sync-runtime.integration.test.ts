import { DashboardReadService, DashboardService, SyncService } from "@nivalis/application";
import { FIXTURE_PROVIDER_MANIFEST } from "@nivalis/connectors";
import { RetryableProviderError } from "@nivalis/domain";
import type { OwnerContext, ProviderRuntimeModule } from "@nivalis/domain";
import {
  createDatabase,
  KyselyProjectionRepository,
  KyselySyncEnqueueUnitOfWork,
  KyselySyncRepository,
  PgBossRuntime,
  Sha256ViewVersionFactory,
  SYNC_QUEUE_NAME,
  SystemClock,
  type NivalisDatabase
} from "@nivalis/api/sync-runtime";
import pino from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMigrator } from "../../api/src/infrastructure/database/migrator";
import { PHASE_TWO_OWNER_ID } from "../../api/src/infrastructure/database/phase-two-fixture";
import { seedPhaseFiveFixture } from "../../api/src/infrastructure/database/seed";
import {
  KyselyDashboardRepository,
  KyselyDashboardUnitOfWork
} from "../../api/src/infrastructure/repositories/kysely-dashboard-repository";
import {
  createTemporaryMigrationDatabase,
  type TemporaryDatabase
} from "../../api/src/testing/temporary-database";
import { buildWorker, StaticProviderRuntimeRegistry, type WorkerRuntime } from "../src/index";
import type { WorkerConfig } from "../src/worker-config";

const owner: OwnerContext = { actorId: PHASE_TWO_OWNER_ID };
const logger = pino({ level: "silent" });
let temporary: TemporaryDatabase;
let database: NivalisDatabase;
let producer: PgBossRuntime | null = null;
let worker: WorkerRuntime | null = null;
let sync: SyncService;

beforeAll(async () => {
  temporary = await createTemporaryMigrationDatabase();
  database = createDatabase({ connectionString: temporary.connectionString, maxConnections: 8 });
  const migrated = await createMigrator(database).migrateToLatest();
  if (migrated.error) throw migrated.error;
});

beforeEach(async () => {
  await seedPhaseFiveFixture(database);
  producer = createQueueRuntime();
  await producer.start();
  sync = new SyncService(
    new KyselySyncRepository(database),
    new KyselySyncEnqueueUnitOfWork(database, producer.boss),
    new SystemClock()
  );
});

afterEach(async () => {
  if (worker) await worker.stop();
  worker = null;
  if (producer) await producer.stop();
  producer = null;
});

afterAll(async () => {
  if (database) await database.destroy();
  if (temporary) await temporary.drop();
});

describe("pg-boss Fixture synchronization runtime", () => {
  it("deduplicates requests, commits live projections, and leaves every revision invariant unchanged", async () => {
    const dashboards = new KyselyDashboardRepository(database);
    const readModels = new DashboardReadService(
      dashboards,
      new KyselyProjectionRepository(database),
      new Sha256ViewVersionFactory()
    );
    const before = await readModels.getPublishedDashboard();
    const beforeHistory = await dashboards.listRevisionsForOwner(owner.actorId, "about", {
      limit: 100
    });

    const runs = await Promise.all([
      sync.enqueue(owner, "fixture"),
      sync.enqueue(owner, "fixture"),
      sync.enqueue(owner, "fixture"),
      sync.enqueue(owner, "fixture")
    ]);
    expect(new Set(runs.map((run) => run.id)).size).toBe(1);

    await producer!.stop();
    producer = null;
    const workerQueue = createQueueRuntime();
    worker = buildWorker({
      config: workerConfig("success"),
      database,
      logger,
      queueRuntime: workerQueue
    });
    await worker.start();
    const completed = await waitForTerminal(runs[0]!.id);
    expect(completed).toMatchObject({ attemptCount: 1, status: "completed" });

    const after = await readModels.getPublishedDashboard();
    const afterHistory = await dashboards.listRevisionsForOwner(owner.actorId, "about", {
      limit: 100
    });
    expect(after.revisionId).toBe(before.revisionId);
    expect(afterHistory.items.map((item) => item.revisionId)).toEqual(
      beforeHistory.items.map((item) => item.revisionId)
    );
    expect(after.viewVersion).not.toBe(before.viewVersion);
    expect(githubStars(after.widgets)).toBe(1_291);

    const raw = await database.selectFrom("provider_raw_snapshots").selectAll().execute();
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw[0]?.payload)).not.toMatch(
      /authorization|cookie|token|api.?key|secret|password/i
    );
    await expect(
      database
        .updateTable("provider_raw_snapshots")
        .set({ source_cursor: "forbidden-mutation" })
        .where("id", "=", raw[0]!.id)
        .execute()
    ).rejects.toThrow(/immutable/i);

    const duplicateQueueJobId = await workerQueue.boss.send(SYNC_QUEUE_NAME, {
      syncRunId: runs[0]!.id
    });
    if (!duplicateQueueJobId) throw new Error("Duplicate delivery fixture was not queued.");
    await waitForQueueCompletion(workerQueue, duplicateQueueJobId);
    expect(await rawSnapshotCount(runs[0]!.id)).toBe(1);
  });

  it("retries transient failures with backoff and succeeds on the third attempt", async () => {
    const run = await sync.enqueue(owner, "fixture");
    worker = buildWorker({ config: workerConfig("retry_then_success"), database, logger });
    await worker.start();
    const completed = await waitForTerminal(run.id, 15_000);
    expect(completed).toMatchObject({ attemptCount: 3, status: "completed" });
    expect(await rawSnapshotCount(run.id)).toBe(1);
  });

  it("bounds repeated transient failure and records a terminal third attempt", async () => {
    const run = await sync.enqueue(owner, "fixture");
    worker = buildWorker({
      config: workerConfig("success"),
      database,
      logger,
      registry: new StaticProviderRuntimeRegistry([alwaysRetryableRuntime()])
    });
    await worker.start();
    const failed = await waitForTerminal(run.id, 15_000);
    expect(failed).toMatchObject({
      attemptCount: 3,
      lastErrorCode: "retryable-provider-error",
      status: "failed"
    });
    expect(await rawSnapshotCount(run.id)).toBe(0);
  });

  it("does not retry permanent failure and preserves Last Known Good Projection", async () => {
    const before = await currentFixtureProjection();
    const readModels = new DashboardReadService(
      new KyselyDashboardRepository(database),
      new KyselyProjectionRepository(database),
      new Sha256ViewVersionFactory()
    );
    const viewBefore = await readModels.getPublishedDashboard();
    const run = await sync.enqueue(owner, "fixture");
    worker = buildWorker({ config: workerConfig("permanent_failure"), database, logger });
    await worker.start();
    const failed = await waitForTerminal(run.id);
    expect(failed).toMatchObject({ attemptCount: 1, status: "failed" });
    expect(await rawSnapshotCount(run.id)).toBe(0);
    expect(await currentFixtureProjection()).toEqual(before);
    const viewAfter = await readModels.getPublishedDashboard();
    expect(viewAfter.viewVersion).not.toBe(viewBefore.viewVersion);
    expect(viewAfter.widgets.find((widget) => widget.type === "github.profile")?.stale).toBe(true);
  });

  it("retains Raw Snapshot evidence when normalization rejects Provider schema", async () => {
    const before = await currentFixtureProjection();
    const run = await sync.enqueue(owner, "fixture");
    worker = buildWorker({ config: workerConfig("normalization_failure"), database, logger });
    await worker.start();
    const failed = await waitForTerminal(run.id);
    expect(failed).toMatchObject({
      attemptCount: 1,
      lastErrorCode: "normalization-error",
      status: "failed"
    });
    expect(await rawSnapshotCount(run.id)).toBe(1);
    expect(await currentFixtureProjection()).toEqual(before);
  });

  it("retains Raw Snapshot evidence when projection fails and recovers a stale running lease", async () => {
    const before = await currentFixtureProjection();
    const projectionFailure = await sync.enqueue(owner, "fixture");
    worker = buildWorker({ config: workerConfig("projection_failure"), database, logger });
    await worker.start();
    expect(await waitForTerminal(projectionFailure.id)).toMatchObject({ status: "failed" });
    expect(await rawSnapshotCount(projectionFailure.id)).toBe(1);
    expect(await currentFixtureProjection()).toEqual(before);

    await worker.stop();
    worker = null;
    await seedPhaseFiveFixture(database);
    const crashed = await sync.enqueue(owner, "fixture");
    const repository = new KyselySyncRepository(database);
    const staleTime = new Date(Date.now() - 60_000);
    await repository.claimRun(crashed.id, staleTime, new Date(staleTime.getTime() - 2_000));
    await producer!.stop();
    producer = null;

    worker = buildWorker({ config: workerConfig("success"), database, logger });
    await worker.start();
    const recovered = await waitForTerminal(crashed.id);
    expect(recovered).toMatchObject({ attemptCount: 2, status: "completed" });
  });

  it("keeps distinct Draft and Published projection keys for one stable Widget identity", async () => {
    const dashboards = new KyselyDashboardRepository(database);
    const dashboardService = new DashboardService(
      dashboards,
      new KyselyDashboardUnitOfWork(database),
      new SystemClock()
    );
    const draft = await dashboardService.getDraftDashboard(owner);
    const changedWidgets = draft.widgets.map((widget) =>
      widget.type === "github.profile"
        ? { ...widget, dataConfig: { ...widget.dataConfig, scope: "recent" } }
        : widget
    );
    const saved = await dashboardService.saveDraft(owner, draft.revisionId, {
      layout: draft.layout,
      widgets: changedWidgets
    });
    const historyBefore = await dashboards.listRevisionsForOwner(owner.actorId, "about", {
      limit: 100
    });

    const run = await sync.enqueue(owner, "fixture");
    worker = buildWorker({ config: workerConfig("success"), database, logger });
    await worker.start();
    await waitForTerminal(run.id);

    const githubRows = await database
      .selectFrom("widget_projections")
      .innerJoin(
        "dashboard_revision_widgets as widget",
        "widget.widget_id",
        "widget_projections.widget_id"
      )
      .select(["widget_projections.projection_key", "widget_projections.data"])
      .where("widget.widget_type", "=", "github.profile")
      .distinct()
      .execute();
    expect(githubRows).toHaveLength(2);
    expect(new Set(githubRows.map((row) => row.projection_key.trim())).size).toBe(2);

    const readModels = new DashboardReadService(
      dashboards,
      new KyselyProjectionRepository(database),
      new Sha256ViewVersionFactory()
    );
    const [published, liveDraft] = await Promise.all([
      readModels.getPublishedDashboard(),
      readModels.getDraftLiveData(owner)
    ]);
    expect(githubScope(published.widgets)).toBeNull();
    expect(githubScope(liveDraft.widgets)).toBe("recent");
    expect(liveDraft.configurationRevisionId).toBe(saved.revisionId);
    const historyAfter = await dashboards.listRevisionsForOwner(owner.actorId, "about", {
      limit: 100
    });
    expect(historyAfter.items).toHaveLength(historyBefore.items.length);
  });
});

function createQueueRuntime() {
  const config = workerConfig("success");
  return new PgBossRuntime(
    {
      connectionString: temporary.connectionString,
      deleteAfterSeconds: config.syncJobDeleteAfterSeconds,
      expireInSeconds: config.syncJobExpireSeconds,
      retryDelay: config.syncRetryBaseDelaySeconds,
      retryDelayMax: config.syncRetryMaxDelaySeconds,
      retryLimit: config.syncMaxAttempts - 1,
      schema: config.syncQueueSchema
    },
    (error) => logger.error({ message: error.message }, "pg-boss test error")
  );
}

function workerConfig(scenario: WorkerConfig["fixtureScenario"]): WorkerConfig {
  return {
    credentialKeyId: "test-primary",
    credentialMasterKey: Buffer.alloc(32, 7).toString("base64url"),
    databaseMaxConnections: 4,
    databaseSsl: false,
    databaseUrl: temporary.connectionString,
    fixtureProviderEnabled: true,
    fixtureScenario: scenario,
    logLevel: "silent",
    neteaseProviderEnabled: false,
    neteaseHttpFixtureEnabled: false,
    neteaseHttpFixtureScenario: "normal",
    neteaseRequestTimeoutMs: 2_000,
    nodeEnv: "test",
    providerAuthLeaseSeconds: 20,
    providerAuthQrPollSeconds: 2,
    providerAuthSmsResendSeconds: 30,
    syncJobDeleteAfterSeconds: 60,
    syncJobExpireSeconds: 20,
    syncMaxAttempts: 3,
    syncPollIntervalSeconds: 0.5,
    syncQueueSchema: "pgboss_phase4_test",
    syncRetryBaseDelaySeconds: 1,
    syncRetryMaxDelaySeconds: 2
  };
}

function alwaysRetryableRuntime(): ProviderRuntimeModule {
  return {
    connector: {
      async collect() {
        throw new RetryableProviderError("Fixture remains unavailable.");
      }
    },
    manifest: FIXTURE_PROVIDER_MANIFEST,
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

async function waitForTerminal(syncRunId: string, timeoutMs = 10_000) {
  const repository = new KyselySyncRepository(database);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await repository.getRun(syncRunId);
    if (run?.status === "completed" || run?.status === "failed") return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`SyncRun '${syncRunId}' did not reach a terminal state.`);
}

async function waitForQueueCompletion(runtime: PgBossRuntime, queueJobId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const job = await runtime.boss.getJobById(SYNC_QUEUE_NAME, queueJobId);
    if (job?.state === "completed") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`pg-boss job '${queueJobId}' did not complete.`);
}

async function rawSnapshotCount(syncRunId: string) {
  const result = await database
    .selectFrom("provider_raw_snapshots")
    .select(({ fn }) => fn.countAll().as("count"))
    .where("sync_run_id", "=", syncRunId)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

async function currentFixtureProjection() {
  const row = await database
    .selectFrom("widget_projections")
    .innerJoin(
      "dashboard_revision_widgets as widget",
      "widget.widget_id",
      "widget_projections.widget_id"
    )
    .select([
      "widget_projections.data",
      "widget_projections.projection_version_id",
      "widget_projections.generated_at"
    ])
    .where("widget.widget_type", "=", "github.profile")
    .orderBy("widget_projections.generated_at", "desc")
    .executeTakeFirstOrThrow();
  return row;
}

function githubStars(
  widgets: Awaited<ReturnType<DashboardReadService["getPublishedDashboard"]>>["widgets"]
) {
  const widget = widgets.find((candidate) => candidate.type === "github.profile");
  if (
    !widget ||
    typeof widget.data !== "object" ||
    widget.data === null ||
    Array.isArray(widget.data)
  ) {
    throw new Error("GitHub Fixture projection is missing.");
  }
  return widget.data.stars;
}

function githubScope(
  widgets: Awaited<ReturnType<DashboardReadService["getPublishedDashboard"]>>["widgets"]
) {
  const widget = widgets.find((candidate) => candidate.type === "github.profile");
  if (
    !widget ||
    typeof widget.data !== "object" ||
    widget.data === null ||
    Array.isArray(widget.data)
  ) {
    throw new Error("GitHub Fixture projection is missing.");
  }
  return typeof widget.dataConfig.scope === "string" ? widget.dataConfig.scope : null;
}
