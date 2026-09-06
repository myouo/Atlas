import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ProviderConnectionService,
  ProviderReplayService,
  SyncWorkerService
} from "@nivalis/application";
import { SteamProviderRuntime } from "@nivalis/connectors";
import {
  createSteamFixtureFetcher,
  steamFixtureId
} from "../../../packages/connectors/src/steam/fixtures";
import {
  AesGcmSecretProtector,
  createDatabase,
  CryptoSyncIdentityFactory,
  KyselyProjectionRepository,
  KyselyProviderCredentialRepository,
  KyselyProviderCredentialResolver,
  KyselyProviderConnectionUnitOfWork,
  KyselySteamCatalogStore,
  KyselySyncRepository,
  KyselySyncUnitOfWork,
  SystemClock,
  type NivalisDatabase
} from "@nivalis/api/sync-runtime";
import { createMigrator } from "../../api/src/infrastructure/database/migrator";
import { seedPhaseFiveFixture } from "../../api/src/infrastructure/database/seed";
import { PHASE_TWO_OWNER_ID } from "../../api/src/infrastructure/database/phase-two-fixture";
import {
  createTemporaryMigrationDatabase,
  type TemporaryDatabase
} from "../../api/src/testing/temporary-database";
import { StaticProviderNativeStoreRegistry, StaticProviderRuntimeRegistry } from "../src/index";

let temporary: TemporaryDatabase;
let database: NivalisDatabase;
beforeAll(async () => {
  temporary = await createTemporaryMigrationDatabase();
  database = createDatabase({ connectionString: temporary.connectionString, maxConnections: 4 });
  const migrated = await createMigrator(database).migrateToLatest();
  if (migrated.error) throw migrated.error;
  await seedPhaseFiveFixture(database);
});
afterAll(async () => {
  if (database) await database.destroy();
  if (temporary) await temporary.drop();
});

describe("Steam PostgreSQL runtime", () => {
  it("encrypts credentials and atomically commits replayable normalized, catalog and projection data", async () => {
    const protector = new AesGcmSecretProtector(new Uint8Array(32).fill(7), "test");
    const repository = new KyselySyncRepository(database);
    const credentialRepository = new KyselyProviderCredentialRepository(database);
    const connections = new ProviderConnectionService(
      credentialRepository,
      new KyselyProviderConnectionUnitOfWork(database),
      protector,
      new SystemClock(),
      async (context, provider) => {
        const connection = await repository.findConnectionForOwnerProvider(
          context.actorId,
          provider
        );
        if (!connection) throw new Error("Missing connection");
        return (await repository.createOrGetActiveRun(connection, new Date())).run;
      }
    );
    await database
      .updateTable("dashboard_revision_widgets")
      .set({
        provider: "steam",
        schema_version: 2,
        data_config: JSON.stringify({ shareRecentGames: true })
      })
      .where("widget_type", "=", "steam.profile")
      .execute();
    const accepted = await connections.connectSteam(
      { actorId: PHASE_TWO_OWNER_ID },
      steamFixtureId,
      "a".repeat(32)
    );
    const runtime = new SteamProviderRuntime(
      new KyselyProviderCredentialResolver(database, protector),
      {},
      createSteamFixtureFetcher()
    );
    const uow = new KyselySyncUnitOfWork(
      database,
      (tx) => new StaticProviderNativeStoreRegistry([new KyselySteamCatalogStore(tx)])
    );
    const projections = new KyselyProjectionRepository(database);
    const registry = new StaticProviderRuntimeRegistry([runtime]);
    const identities = new CryptoSyncIdentityFactory();
    const clock = new SystemClock();
    const service = new SyncWorkerService(uow, projections, registry, identities, clock, 3, 120000);
    expect((await service.process(accepted.validationJob.id)).status).toBe("completed");
    expect(await connections.getSteam({ actorId: PHASE_TWO_OWNER_ID })).toMatchObject({
      credentialStatus: "valid",
      displayName: "Steam Fixture",
      providerAccountId: steamFixtureId
    });
    const raw = await repository.listRawSnapshotsForRun(accepted.validationJob.id);
    expect(raw).toHaveLength(6);
    const saved = await database
      .selectFrom("widget_projections")
      .selectAll()
      .where("provider", "=", "steam")
      .execute();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.data).toMatchObject({
      provider: "steam",
      library: { gameCount: 2, playtimeMinutes: 125 }
    });
    expect(
      await database
        .selectFrom("provider_normalized_snapshots")
        .selectAll()
        .where("provider", "=", "steam")
        .execute()
    ).toHaveLength(1);
    const replay = new ProviderReplayService(uow, projections, registry, identities, clock);
    expect(
      (await replay.replay(raw[0]!.id)).diff.every((item) => item.change === "unchanged")
    ).toBe(true);
    await connections.disconnectSteam({ actorId: PHASE_TWO_OWNER_ID });
    expect(
      await credentialRepository.get(accepted.providerConnectionId, "steam_web_api")
    ).toBeNull();
  });
});
