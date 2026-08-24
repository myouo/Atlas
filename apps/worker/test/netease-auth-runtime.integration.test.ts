import { randomUUID } from "node:crypto";

import { DashboardReadService, ProviderAuthService } from "@nivalis/application";
import {
  AesGcmSecretProtector,
  createDatabase,
  decodeCredentialMasterKey,
  KyselyProviderAuthAttemptRepository,
  KyselyProviderAuthEnqueueUnitOfWork,
  KyselyProviderConnectionUnitOfWork,
  KyselyProviderCredentialRepository,
  KyselyProjectionRepository,
  PgBossRuntime,
  Sha256ViewVersionFactory,
  SystemClock,
  type NivalisDatabase
} from "@nivalis/api/sync-runtime";
import pino from "pino";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMigrator } from "../../api/src/infrastructure/database/migrator";
import {
  PHASE_FIVE_NETEASE_CONNECTION_ID,
  PHASE_TWO_OWNER_ID
} from "../../api/src/infrastructure/database/phase-two-fixture";
import { seedPhaseFiveFixture } from "../../api/src/infrastructure/database/seed";
import { KyselyDashboardRepository } from "../../api/src/infrastructure/repositories/kysely-dashboard-repository";
import {
  createTemporaryMigrationDatabase,
  type TemporaryDatabase
} from "../../api/src/testing/temporary-database";
import { buildWorker, type WorkerRuntime } from "../src/index";
import type { WorkerConfig } from "../src/worker-config";

const logger = pino({ level: "silent" });
const masterKey = Buffer.alloc(32, 7).toString("base64url");
const owner = { actorId: PHASE_TWO_OWNER_ID };
let temporary: TemporaryDatabase;
let database: NivalisDatabase;
let producer: PgBossRuntime | null = null;
let worker: WorkerRuntime | null = null;
let auth: ProviderAuthService;

beforeAll(async () => {
  temporary = await createTemporaryMigrationDatabase();
  database = createDatabase({ connectionString: temporary.connectionString, maxConnections: 8 });
  const migration = await createMigrator(database).migrateToLatest();
  if (migration.error) throw migration.error;
});

beforeEach(async () => {
  await seedPhaseFiveFixture(database);
  const now = new Date();
  await database
    .insertInto("actors")
    .values({ created_at: now, id: PHASE_TWO_OWNER_ID, role: "owner", updated_at: now })
    .onConflict((conflict) => conflict.column("id").doUpdateSet({ updated_at: now }))
    .execute();
  producer = queueRuntime();
  await producer.start();
  const protector = new AesGcmSecretProtector(decodeCredentialMasterKey(masterKey), "test-primary");
  auth = new ProviderAuthService(
    new KyselyProviderAuthAttemptRepository(database),
    new KyselyProviderAuthEnqueueUnitOfWork(database, producer.boss),
    protector,
    { create: randomUUID },
    new SystemClock(),
    { providerEnabled: true, qrTtlMs: 60_000, smsTtlMs: 120_000 }
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

describe("Worker-owned NetEase interactive authentication", () => {
  it("survives a Worker restart, extracts only MUSIC_U, and starts validation Sync", async () => {
    const before = await revisionIdentity();
    const first = await auth.startQr(owner);
    const duplicate = await auth.startQr(owner);
    expect(duplicate.id).toBe(first.id);

    worker = buildWorker({ config: workerConfig(), database, logger });
    await worker.start();
    await waitForAttempt(first.id, ["waiting_for_scan", "waiting_for_confirmation"]);
    const prepared = await auth.get(owner, first.id);
    expect(prepared.qrUrl).toContain("music.163.com/login?codekey=");
    const encrypted = await database
      .selectFrom("provider_auth_attempts")
      .select(["secret_ciphertext", "secret_nonce", "secret_auth_tag"])
      .where("id", "=", first.id)
      .executeTakeFirstOrThrow();
    expect(encrypted.secret_ciphertext).not.toBeNull();
    expect(JSON.stringify(encrypted)).not.toContain("nivalis-sanitized-fixture-key");

    await worker.stop();
    worker = buildWorker({ config: workerConfig(), database, logger });
    await worker.start();
    const connected = await waitForAttempt(first.id, ["connected"], 15_000);
    expect(connected.status).toBe("connected");
    await waitForCredentialValidation();

    const terminal = await database
      .selectFrom("provider_auth_attempts")
      .select([
        "secret_ciphertext",
        "secret_nonce",
        "secret_auth_tag",
        "encryption_version",
        "key_id"
      ])
      .where("id", "=", first.id)
      .executeTakeFirstOrThrow();
    expect(terminal).toEqual({
      encryption_version: null,
      key_id: null,
      secret_auth_tag: null,
      secret_ciphertext: null,
      secret_nonce: null
    });
    const credential = await database
      .selectFrom("provider_credentials")
      .select(["ciphertext", "status"])
      .executeTakeFirstOrThrow();
    expect(credential.status).toBe("valid");
    expect(Buffer.from(credential.ciphertext).toString("utf8")).not.toContain(
      "nivalis_fixture_music_u_credential"
    );
    const rawText = JSON.stringify(
      (await database.selectFrom("provider_raw_snapshots").select("payload").execute()).map(
        (row) => row.payload
      )
    );
    expect(rawText).not.toMatch(/MUSIC_U|cookie|captcha|13800138000/i);
    expect(await revisionIdentity()).toEqual(before);

    const readService = new DashboardReadService(
      new KyselyDashboardRepository(database),
      new KyselyProjectionRepository(database),
      new Sha256ViewVersionFactory()
    );
    const viewBeforeDisconnect = await readService.getPublishedDashboard();
    const neteaseBefore = viewBeforeDisconnect.widgets.find(
      (widget) => widget.type === "music.netease.overview"
    )!;
    expect(neteaseBefore.stale).toBe(false);
    const connections = new KyselyProviderCredentialRepository(database);
    await connections.delete(PHASE_FIVE_NETEASE_CONNECTION_ID, "music_u");
    await connections.disableForOwner(PHASE_TWO_OWNER_ID, "netease", new Date());
    const viewAfterDisconnect = await readService.getPublishedDashboard();
    const neteaseAfter = viewAfterDisconnect.widgets.find(
      (widget) => widget.type === "music.netease.overview"
    )!;
    expect(neteaseAfter.data).toEqual(neteaseBefore.data);
    expect(neteaseAfter.stale).toBe(true);
    expect(viewAfterDisconnect.viewVersion).not.toBe(viewBeforeDisconnect.viewVersion);
    expect(await connections.getForOwner(PHASE_TWO_OWNER_ID, "netease")).toMatchObject({
      configured: false,
      displayName: null,
      enabled: false,
      providerAccountId: null
    });
    expect(await revisionIdentity()).toEqual(before);
  });

  it("encrypts phone/code state, verifies SMS, and erases the attempt envelope", async () => {
    const attempt = await auth.startSms(owner, "13800138000", "86");
    expect(attempt.maskedPhone).toBe("+86 138****8000");
    const queuedRow = await database
      .selectFrom("provider_auth_attempts")
      .selectAll()
      .where("id", "=", attempt.id)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(queuedRow)).not.toContain("13800138000");

    worker = buildWorker({ config: workerConfig(), database, logger });
    await worker.start();
    await waitForAttempt(attempt.id, ["waiting_for_code"]);
    const verifying = await auth.verifySms(owner, attempt.id, "123456");
    expect(verifying.status).toBe("queued");
    const codeRow = await database
      .selectFrom("provider_auth_attempts")
      .selectAll()
      .where("id", "=", attempt.id)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(codeRow)).not.toMatch(/13800138000|123456/);

    await waitForAttempt(attempt.id, ["connected"], 10_000);
    await waitForCredentialValidation();
    const terminal = await database
      .selectFrom("provider_auth_attempts")
      .select(["secret_ciphertext", "status"])
      .where("id", "=", attempt.id)
      .executeTakeFirstOrThrow();
    expect(terminal).toEqual({ secret_ciphertext: null, status: "connected" });
  });

  it("fails Provider risk control without retrying or creating a credential", async () => {
    const attempt = await auth.startSms(owner, "13800138000", "86");
    worker = buildWorker({
      config: workerConfig("credential_expired"),
      database,
      logger
    });
    await worker.start();
    const failed = await waitForAttempt(attempt.id, ["failed"]);
    expect(failed).toMatchObject({
      failureCount: 0,
      lastErrorCode: "provider-authentication-failed",
      status: "failed"
    });
    expect(failed.protectedState).toBeNull();
    const credentials = await database
      .selectFrom("provider_credentials")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(credentials.count)).toBe(0);
  });

  it("surfaces QR schema drift and erases transient state", async () => {
    const attempt = await auth.startQr(owner);
    worker = buildWorker({ config: workerConfig("schema_drift"), database, logger });
    await worker.start();
    const failed = await waitForAttempt(attempt.id, ["failed"]);
    expect(failed).toMatchObject({
      lastErrorCode: "provider-schema-mismatch",
      protectedState: null,
      status: "failed"
    });
  });

  it("rejects an old AuthAttempt after a newer disconnect tombstone", async () => {
    const attempt = await auth.startQr(owner);
    const disconnectedAt = new Date(attempt.createdAt.getTime() + 1_000);
    await database
      .updateTable("provider_connections")
      .set({ enabled: false, updated_at: disconnectedAt })
      .where("owner_id", "=", PHASE_TWO_OWNER_ID)
      .where("provider", "=", "netease")
      .execute();

    await expect(
      new KyselyProviderConnectionUnitOfWork(database).run((connections) =>
        connections.upsertForOwner({
          acquiredFromAttemptAt: attempt.createdAt,
          now: new Date(disconnectedAt.getTime() + 1_000),
          ownerId: PHASE_TWO_OWNER_ID,
          provider: "netease"
        })
      )
    ).rejects.toMatchObject({ code: "provider-auth-attempt-state" });
    const connection = await database
      .selectFrom("provider_connections")
      .select("enabled")
      .where("owner_id", "=", PHASE_TWO_OWNER_ID)
      .where("provider", "=", "netease")
      .executeTakeFirstOrThrow();
    expect(connection.enabled).toBe(false);
  });
});

function workerConfig(
  authScenario: WorkerConfig["neteaseHttpFixtureScenario"] = "normal"
): WorkerConfig {
  return {
    credentialKeyId: "test-primary",
    credentialMasterKey: masterKey,
    databaseMaxConnections: 4,
    databaseSsl: false,
    databaseUrl: temporary.connectionString,
    fixtureProviderEnabled: false,
    fixtureScenario: "success",
    logLevel: "silent",
    neteaseHttpFixtureEnabled: true,
    neteaseHttpFixtureScenario: authScenario,
    neteaseProviderEnabled: true,
    neteaseRequestTimeoutMs: 2_000,
    nodeEnv: "test",
    providerAuthLeaseSeconds: 5,
    providerAuthQrPollSeconds: 0.5,
    providerAuthSmsResendSeconds: 10,
    syncJobDeleteAfterSeconds: 60,
    syncJobExpireSeconds: 20,
    syncMaxAttempts: 3,
    syncPollIntervalSeconds: 0.5,
    syncQueueSchema: "pgboss_netease_auth_test",
    syncRetryBaseDelaySeconds: 1,
    syncRetryMaxDelaySeconds: 2
  };
}

function queueRuntime() {
  const config = workerConfig();
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
    () => undefined
  );
}

async function waitForAttempt(attemptId: string, statuses: readonly string[], timeoutMs = 8_000) {
  const repository = new KyselyProviderAuthAttemptRepository(database);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const attempt = await repository.get(attemptId);
    if (attempt && statuses.includes(attempt.status)) return attempt;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`AuthAttempt '${attemptId}' did not reach ${statuses.join("/")}.`);
}

async function waitForCredentialValidation() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const row = await database
      .selectFrom("provider_credentials")
      .select("status")
      .executeTakeFirst();
    if (row?.status === "valid") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Acquired credential was not validated by SyncRuntime.");
}

async function revisionIdentity() {
  const dashboard = await database
    .selectFrom("dashboards")
    .select(["current_draft_revision_id", "current_published_revision_id"])
    .where("slug", "=", "about")
    .executeTakeFirstOrThrow();
  const history = await database
    .selectFrom("dashboard_revisions")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirstOrThrow();
  return {
    draft: dashboard.current_draft_revision_id,
    history: Number(history.count),
    published: dashboard.current_published_revision_id
  };
}
