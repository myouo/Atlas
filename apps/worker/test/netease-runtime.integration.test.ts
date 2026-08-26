import {
  ProviderReplayService,
  SyncWorkerService,
  type ProviderNativeStoreRegistry,
  type ProviderRuntimeRegistry
} from "@nivalis/application";
import {
  KyselyNeteaseNativeStore,
  NeteaseProviderRuntime,
  normalNeteaseFixture,
  schemaDriftFixture,
  NETEASE_SOURCE,
  type NeteaseNativeDatabase
} from "@nivalis/connectors";
import { ProjectionError } from "@nivalis/domain";
import type { ProviderRuntimeModule, ProviderType } from "@nivalis/domain";
import {
  AesGcmSecretProtector,
  CryptoSyncIdentityFactory,
  decodeCredentialMasterKey,
  KyselyProjectionRepository,
  KyselyProviderCredentialResolver,
  KyselySyncRepository,
  KyselySyncUnitOfWork,
  Sha256ViewVersionFactory,
  SystemClock,
  type NivalisDatabase
} from "@nivalis/api/sync-runtime";
import type { Transaction } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMigrator } from "../../api/src/infrastructure/database/migrator";
import {
  PHASE_FIVE_NETEASE_CONNECTION_ID,
  PHASE_TWO_OWNER_ID
} from "../../api/src/infrastructure/database/phase-two-fixture";
import { seedPhaseFiveFixture } from "../../api/src/infrastructure/database/seed";
import { createDatabase } from "../../api/src/infrastructure/database/database";
import { KyselyDashboardRepository } from "../../api/src/infrastructure/repositories/kysely-dashboard-repository";
import { KyselyProviderCredentialRepository } from "../../api/src/infrastructure/repositories/kysely-provider-credential-repository";
import { DashboardReadService } from "@nivalis/application";
import {
  createTemporaryMigrationDatabase,
  type TemporaryDatabase
} from "../../api/src/testing/temporary-database";

const masterKey = Buffer.alloc(32, 11).toString("base64url");
const credential = "phase-five-encrypted-music-u-value";
const clock = new SystemClock();
let temporary: TemporaryDatabase;
let database: NivalisDatabase;

beforeAll(async () => {
  temporary = await createTemporaryMigrationDatabase();
  database = createDatabase({ connectionString: temporary.connectionString, maxConnections: 8 });
  const migration = await createMigrator(database).migrateToLatest();
  if (migration.error) throw migration.error;
});

beforeEach(() => seedPhaseFiveFixture(database));

afterAll(async () => {
  if (database) await database.destroy();
  if (temporary) await temporary.drop();
});

describe("NetEase encrypted Provider runtime", () => {
  it("runs Connector → Raw → Native → Projection idempotently without mutating revisions", async () => {
    const resolver = await configureCredential();
    const runtime = new NeteaseProviderRuntime(
      resolver,
      { timeoutMs: 2_000 },
      fixtureFetcher(normalNeteaseFixture)
    );
    const dashboards = new KyselyDashboardRepository(database);
    const read = new DashboardReadService(
      dashboards,
      new KyselyProjectionRepository(database),
      new Sha256ViewVersionFactory()
    );
    const before = await revisionState(dashboards, read);

    const first = await createRun();
    const completed = await worker(runtime).process(first.id);
    expect(completed).toMatchObject({ attemptCount: 1, status: "completed" });
    const after = await revisionState(dashboards, read);
    expect(after.draftRevisionId).toBe(before.draftRevisionId);
    expect(after.publishedRevisionId).toBe(before.publishedRevisionId);
    expect(after.historyIds).toEqual(before.historyIds);
    expect(after.dataVersion).not.toBe(before.dataVersion);
    expect(after.viewVersion).not.toBe(before.viewVersion);

    const raw = await database
      .selectFrom("provider_raw_snapshots")
      .selectAll()
      .where("sync_run_id", "=", first.id)
      .orderBy("created_at", "asc")
      .execute();
    expect(raw.map((snapshot) => snapshot.source_kind).sort()).toEqual(
      Object.values(NETEASE_SOURCE).sort()
    );
    expect(JSON.stringify(raw.map((snapshot) => snapshot.payload))).not.toContain(credential);
    expect(JSON.stringify(raw.map((snapshot) => snapshot.payload))).not.toMatch(
      /authorization|cookie|music_u|csrf|access.?token|secret|password/i
    );
    expect(await nativeCounts()).toEqual({ artists: 2, recent: 2, tracks: 3 });
    expect(await projectedTotal()).toBe(6_421);
    const catalog = await database
      .selectFrom("provider_data_catalogs")
      .select(["data", "schema_version"])
      .where("provider_connection_id", "=", PHASE_FIVE_NETEASE_CONNECTION_ID)
      .executeTakeFirstOrThrow();
    expect(catalog.schema_version).toBe(1);
    expect(catalog.data).toMatchObject({
      listening: { totalDurationSeconds: 582_420 },
      provider: "netease"
    });

    const second = await createRun();
    await worker(runtime).process(second.id);
    expect(await nativeCounts()).toEqual({ artists: 2, recent: 2, tracks: 3 });
    expect(await projectedTotal()).toBe(6_421);

    const replay = replayService(runtime);
    const projectionVersionBefore = await currentProjectionVersion();
    const dryRun = await replay.replay(raw[0]!.id);
    expect(dryRun).toMatchObject({ committed: false, provider: "netease" });
    expect(dryRun.diff.every((item) => item.change === "unchanged")).toBe(true);
    expect(await currentProjectionVersion()).toBe(projectionVersionBefore);
    const revisionsBeforeCommit = await revisionState(dashboards, read);
    const committedReplay = await replay.replay(raw[0]!.id, true);
    expect(committedReplay.committed).toBe(true);
    expect(await currentProjectionVersion()).not.toBe(projectionVersionBefore);
    const revisionsAfterCommit = await revisionState(dashboards, read);
    expect(revisionsAfterCommit.draftRevisionId).toBe(revisionsBeforeCommit.draftRevisionId);
    expect(revisionsAfterCommit.publishedRevisionId).toBe(
      revisionsBeforeCommit.publishedRevisionId
    );
    expect(revisionsAfterCommit.historyIds).toEqual(revisionsBeforeCommit.historyIds);
  });

  it("marks an expired credential once and preserves Last Known Good", async () => {
    const resolver = await configureCredential();
    const before = await currentProjection();
    const runtime = new NeteaseProviderRuntime(resolver, { timeoutMs: 2_000 }, async () =>
      Response.json({ code: 301, message: "login required" })
    );
    const run = await createRun();
    const failed = await worker(runtime).process(run.id);
    expect(failed).toMatchObject({
      attemptCount: 1,
      lastErrorCode: "provider-credential-error",
      status: "failed"
    });
    expect(await currentProjection()).toEqual(before);
    const credentialRow = await database
      .selectFrom("provider_credentials")
      .select("status")
      .executeTakeFirstOrThrow();
    expect(credentialRow.status).toBe("expired");
    const syncState = await database
      .selectFrom("provider_sync_states")
      .select("status")
      .where("provider_connection_id", "=", PHASE_FIVE_NETEASE_CONNECTION_ID)
      .executeTakeFirstOrThrow();
    expect(syncState.status).toBe("credential_invalid");
    expect(await rawCount(run.id)).toBe(0);
  });

  it("preserves all Raw evidence and Last Known Good on Provider schema drift", async () => {
    const resolver = await configureCredential();
    const before = await currentProjection();
    const run = await createRun();
    const failed = await worker(
      new NeteaseProviderRuntime(resolver, { timeoutMs: 2_000 }, fixtureFetcher(schemaDriftFixture))
    ).process(run.id);
    expect(failed).toMatchObject({
      lastErrorCode: "provider-schema-mismatch",
      status: "failed"
    });
    expect(await rawCount(run.id)).toBe(Object.keys(NETEASE_SOURCE).length);
    expect(await currentProjection()).toEqual(before);
    expect(await nativeCounts()).toEqual({ artists: 0, recent: 0, tracks: 0 });
  });

  it("rolls back Native/Projection changes after a successful fetch when projection fails", async () => {
    const resolver = await configureCredential();
    const before = await currentProjection();
    const actual = new NeteaseProviderRuntime(
      resolver,
      { timeoutMs: 2_000 },
      fixtureFetcher(normalNeteaseFixture)
    );
    const runtime: ProviderRuntimeModule = {
      ...actual,
      projector: {
        provider: "netease",
        async project() {
          throw new ProjectionError("Intentional projection failure.");
        }
      }
    };
    const run = await createRun();
    const failed = await worker(runtime).process(run.id);
    expect(failed).toMatchObject({ lastErrorCode: "projection-error", status: "failed" });
    expect(await rawCount(run.id)).toBe(Object.keys(NETEASE_SOURCE).length);
    expect(await currentProjection()).toEqual(before);
    expect(await nativeCounts()).toEqual({ artists: 0, recent: 0, tracks: 0 });
  });

  it("turns a wrong master key into a structured credential failure without crashing", async () => {
    await configureCredential();
    const wrongProtector = new AesGcmSecretProtector(Buffer.alloc(32, 12), "test-primary");
    const resolver = new KyselyProviderCredentialResolver(database, wrongProtector);
    const before = await currentProjection();
    const run = await createRun();
    const failed = await worker(
      new NeteaseProviderRuntime(
        resolver,
        { timeoutMs: 2_000 },
        fixtureFetcher(normalNeteaseFixture)
      )
    ).process(run.id);
    expect(failed).toMatchObject({
      attemptCount: 1,
      lastErrorCode: "provider-credential-error",
      status: "failed"
    });
    expect(await rawCount(run.id)).toBe(0);
    expect(await currentProjection()).toEqual(before);
  });

  it("does not commit Projection when the connection is disconnected during fetch", async () => {
    const resolver = await configureCredential();
    const before = await currentProjection();
    const baseFetcher = fixtureFetcher(normalNeteaseFixture);
    let releaseFetch!: () => void;
    let announceFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      announceFetch = resolve;
    });
    const fetchReleased = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    let first = true;
    const delayedFetcher: typeof fetch = async (input, init) => {
      if (first) {
        first = false;
        announceFetch();
        await fetchReleased;
      }
      return baseFetcher(input, init);
    };
    const run = await createRun();
    const processing = worker(
      new NeteaseProviderRuntime(resolver, { timeoutMs: 2_000 }, delayedFetcher)
    ).process(run.id);
    await fetchStarted;
    await database
      .updateTable("provider_connections")
      .set({ enabled: false, updated_at: new Date() })
      .where("id", "=", PHASE_FIVE_NETEASE_CONNECTION_ID)
      .execute();
    await database
      .deleteFrom("provider_credentials")
      .where("provider_connection_id", "=", PHASE_FIVE_NETEASE_CONNECTION_ID)
      .execute();
    releaseFetch();

    await expect(processing).resolves.toMatchObject({
      lastErrorCode: "permanent-provider-error",
      status: "failed"
    });
    expect(await rawCount(run.id)).toBe(Object.keys(NETEASE_SOURCE).length);
    expect(await currentProjection()).toEqual(before);
  });
});

async function configureCredential() {
  const protector = new AesGcmSecretProtector(decodeCredentialMasterKey(masterKey), "test-primary");
  const repository = new KyselyProviderCredentialRepository(database);
  const connection = await repository.upsertForOwner({
    now: clock.now(),
    ownerId: PHASE_TWO_OWNER_ID,
    provider: "netease"
  });
  const protectedSecret = await protector.protect(credential, {
    credentialType: "music_u",
    ownerId: PHASE_TWO_OWNER_ID,
    purpose: "provider_credential",
    subjectId: connection.id
  });
  await repository.save({
    credentialType: "music_u",
    now: clock.now(),
    protectedSecret,
    providerConnectionId: connection.id,
    status: "pending_validation"
  });
  const row = await database
    .selectFrom("provider_credentials")
    .select("ciphertext")
    .where("provider_connection_id", "=", connection.id)
    .executeTakeFirstOrThrow();
  expect(Buffer.from(row.ciphertext).toString("utf8")).not.toContain(credential);
  return new KyselyProviderCredentialResolver(database, protector);
}

async function createRun() {
  const repository = new KyselySyncRepository(database);
  const connection = await repository.getConnection(PHASE_FIVE_NETEASE_CONNECTION_ID);
  if (!connection) throw new Error("Seed NetEase connection was not found.");
  return (await repository.createOrGetActiveRun(connection, clock.now())).run;
}

function worker(runtime: ProviderRuntimeModule) {
  return new SyncWorkerService(
    createUnitOfWork(),
    new KyselyProjectionRepository(database),
    new RuntimeRegistry([runtime]),
    new CryptoSyncIdentityFactory(),
    clock,
    3,
    120_000
  );
}

function replayService(runtime: ProviderRuntimeModule) {
  return new ProviderReplayService(
    createUnitOfWork(),
    new KyselyProjectionRepository(database),
    new RuntimeRegistry([runtime]),
    new CryptoSyncIdentityFactory(),
    clock
  );
}

function createUnitOfWork() {
  return new KyselySyncUnitOfWork(
    database,
    (transaction) =>
      new NativeRegistry([
        new KyselyNeteaseNativeStore(transaction as unknown as Transaction<NeteaseNativeDatabase>)
      ])
  );
}

class RuntimeRegistry implements ProviderRuntimeRegistry {
  private readonly values: ReadonlyMap<ProviderType, ProviderRuntimeModule>;
  constructor(values: readonly ProviderRuntimeModule[]) {
    this.values = new Map(values.map((value) => [value.provider, value]));
  }
  get(provider: ProviderType) {
    return this.values.get(provider) ?? null;
  }
}

class NativeRegistry implements ProviderNativeStoreRegistry {
  constructor(private readonly values: readonly KyselyNeteaseNativeStore[]) {}
  get(provider: ProviderType) {
    return this.values.find((value) => value.provider === provider) ?? null;
  }
}

function fixtureFetcher(fixture: typeof normalNeteaseFixture): typeof fetch {
  let playRecordRequests = 0;
  return async (input) => {
    const pathname = new URL(input instanceof Request ? input.url : input.toString()).pathname;
    if (pathname.includes("account/get")) return Response.json(fixture[NETEASE_SOURCE.account]);
    if (pathname.includes("w/v1/user/detail")) {
      return Response.json(fixture[NETEASE_SOURCE.profileHome]);
    }
    if (pathname.includes("personal/home/page/user")) {
      return Response.json(fixture[NETEASE_SOURCE.profileShowcase]);
    }
    if (pathname.includes("user/page/window/get")) {
      return Response.json(fixture[NETEASE_SOURCE.profileMusicCards]);
    }
    if (pathname.includes("v1/user/detail")) {
      return Response.json(fixture[NETEASE_SOURCE.userDetail]);
    }
    if (pathname.includes("user/level")) return Response.json(fixture[NETEASE_SOURCE.userLevel]);
    if (pathname.includes("music-vip-membership")) {
      return Response.json(fixture[NETEASE_SOURCE.vipInfo]);
    }
    if (pathname.includes("listen/data/total")) {
      return Response.json(fixture[NETEASE_SOURCE.listenTotal]);
    }
    if (pathname.includes("play/record")) {
      playRecordRequests += 1;
      return Response.json(
        playRecordRequests % 2 === 0
          ? fixture[NETEASE_SOURCE.allTimeRecord]
          : fixture[NETEASE_SOURCE.weeklyRecord]
      );
    }
    if (pathname.includes("song/list")) return Response.json(fixture[NETEASE_SOURCE.recentSongs]);
    if (pathname.includes("realtime/report")) {
      return Response.json(fixture[NETEASE_SOURCE.listenReportWeek]);
    }
    if (pathname.includes("user/getfollows/")) {
      return Response.json(fixture[NETEASE_SOURCE.following]);
    }
    if (pathname.includes("user/getfolloweds/")) {
      return Response.json(fixture[NETEASE_SOURCE.followers]);
    }
    if (pathname.includes("user/playlist/create")) {
      return Response.json(fixture[NETEASE_SOURCE.createdPlaylists]);
    }
    if (pathname.includes("medal/user/page")) return Response.json(fixture[NETEASE_SOURCE.medals]);
    if (pathname.includes("social/user/status")) {
      return Response.json(fixture[NETEASE_SOURCE.socialStatus]);
    }
    return Response.json({ code: 404 }, { status: 404 });
  };
}

async function revisionState(dashboards: KyselyDashboardRepository, read: DashboardReadService) {
  const [draft, published, history, draftData, publicView] = await Promise.all([
    dashboards.getCurrentForOwner(PHASE_TWO_OWNER_ID, "about", "draft"),
    dashboards.getCurrentBySlug("about", "published"),
    dashboards.listRevisionsForOwner(PHASE_TWO_OWNER_ID, "about", { limit: 100 }),
    read.getDraftLiveData({ actorId: PHASE_TWO_OWNER_ID }),
    read.getPublishedDashboard()
  ]);
  return {
    dataVersion: draftData.dataVersion,
    draftRevisionId: draft!.revisionId,
    historyIds: history.items.map((revision) => revision.revisionId),
    publishedRevisionId: published!.revisionId,
    viewVersion: publicView.viewVersion
  };
}

async function nativeCounts() {
  const [tracks, artists, recent] = await Promise.all([
    database
      .selectFrom("netease_tracks")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("netease_artists")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("netease_recent_listens")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow()
  ]);
  return {
    artists: Number(artists.count),
    recent: Number(recent.count),
    tracks: Number(tracks.count)
  };
}

async function currentProjection() {
  return database
    .selectFrom("widget_projections")
    .select(["data", "projection_version_id", "generated_at", "stale"])
    .where("provider", "=", "netease")
    .executeTakeFirstOrThrow();
}

async function currentProjectionVersion() {
  return (await currentProjection()).projection_version_id;
}

async function projectedTotal() {
  const data = (await currentProjection()).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const metric = data.totalListenCount;
  if (!metric || typeof metric !== "object" || Array.isArray(metric)) return null;
  return metric.value;
}

async function rawCount(syncRunId: string) {
  const row = await database
    .selectFrom("provider_raw_snapshots")
    .select(({ fn }) => fn.countAll().as("count"))
    .where("sync_run_id", "=", syncRunId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
