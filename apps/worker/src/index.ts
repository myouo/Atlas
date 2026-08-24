import {
  ProviderAuthWorkerService,
  ProviderConnectionService,
  SyncService,
  SyncWorkerService
} from "@nivalis/application";
import type { ProviderAuthRuntimeRegistry, ProviderRuntimeRegistry } from "@nivalis/application";
import {
  FixtureProviderRuntime,
  createNeteaseHttpFixtureFetcher,
  KyselyNeteaseNativeStore,
  NeteaseAuthClient,
  NeteaseProviderRuntime,
  type NeteaseNativeDatabase
} from "@nivalis/connectors";
import type { ProviderNativeStore, ProviderNativeStoreRegistry } from "@nivalis/application";
import type {
  ProviderAuthRuntimeModule,
  ProviderRuntimeModule,
  ProviderType
} from "@nivalis/domain";
import {
  createDatabase,
  AesGcmSecretProtector,
  CryptoSyncIdentityFactory,
  decodeCredentialMasterKey,
  KyselyProjectionRepository,
  KyselyProviderAuthAttemptRepository,
  KyselyProviderConnectionUnitOfWork,
  KyselyProviderCredentialRepository,
  KyselySyncUnitOfWork,
  KyselySyncEnqueueUnitOfWork,
  KyselySyncRepository,
  KyselyProviderCredentialResolver,
  PgBossProviderAuthJobQueue,
  PgBossRuntime,
  PROVIDER_AUTH_QUEUE_NAME,
  SYNC_QUEUE_NAME,
  SystemClock,
  type NivalisDatabase
} from "@nivalis/api/sync-runtime";
import type { Transaction } from "kysely";
import type { Logger } from "pino";

import type { WorkerConfig } from "./worker-config";

interface SyncJobPayload {
  readonly syncRunId: string;
}

interface ProviderAuthJobPayload {
  readonly attemptId: string;
}

export interface WorkerRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BuildWorkerOptions {
  readonly config: WorkerConfig;
  readonly database?: NivalisDatabase;
  readonly logger: Logger;
  readonly queueRuntime?: PgBossRuntime;
  readonly registry?: ProviderRuntimeRegistry;
  readonly authRegistry?: ProviderAuthRuntimeRegistry;
}

export function buildWorker(options: BuildWorkerOptions): WorkerRuntime {
  const ownsDatabase = !options.database;
  const database =
    options.database ??
    createDatabase({
      connectionString: options.config.databaseUrl,
      maxConnections: options.config.databaseMaxConnections,
      ssl: options.config.databaseSsl
    });
  const queueRuntime =
    options.queueRuntime ??
    new PgBossRuntime(
      {
        connectionString: options.config.databaseUrl,
        deleteAfterSeconds: options.config.syncJobDeleteAfterSeconds,
        expireInSeconds: options.config.syncJobExpireSeconds,
        retryDelay: options.config.syncRetryBaseDelaySeconds,
        retryDelayMax: options.config.syncRetryMaxDelaySeconds,
        retryLimit: Math.max(0, options.config.syncMaxAttempts - 1),
        schema: options.config.syncQueueSchema
      },
      (error) =>
        options.logger.error(
          { error: { message: error.message, name: error.name } },
          "pg-boss runtime error"
        )
    );
  const protector = new AesGcmSecretProtector(
    decodeCredentialMasterKey(options.config.credentialMasterKey),
    options.config.credentialKeyId
  );
  const providerComposition = createProviderComposition(options.config, database, protector);
  const registry = options.registry ?? providerComposition.sync;
  const service = new SyncWorkerService(
    new KyselySyncUnitOfWork(
      database,
      (transaction) =>
        new StaticProviderNativeStoreRegistry(
          options.config.neteaseProviderEnabled
            ? [
                new KyselyNeteaseNativeStore(
                  transaction as unknown as Transaction<NeteaseNativeDatabase>
                )
              ]
            : []
        )
    ),
    new KyselyProjectionRepository(database),
    registry,
    new CryptoSyncIdentityFactory(),
    new SystemClock(),
    options.config.syncMaxAttempts,
    options.config.syncJobExpireSeconds * 1_000
  );
  const syncService = new SyncService(
    new KyselySyncRepository(database),
    new KyselySyncEnqueueUnitOfWork(database, queueRuntime.boss),
    new SystemClock(),
    (provider) =>
      (provider !== "fixture" || options.config.fixtureProviderEnabled) &&
      (provider !== "netease" || options.config.neteaseProviderEnabled)
  );
  const connectionService = new ProviderConnectionService(
    new KyselyProviderCredentialRepository(database),
    new KyselyProviderConnectionUnitOfWork(database),
    protector,
    new SystemClock(),
    (context, provider) => syncService.enqueue(context, provider)
  );
  const authService = new ProviderAuthWorkerService(
    new KyselyProviderAuthAttemptRepository(database),
    new PgBossProviderAuthJobQueue(queueRuntime.boss),
    options.authRegistry ?? providerComposition.auth,
    protector,
    new SystemClock(),
    (context, credential, attemptCreatedAt) =>
      connectionService.connectNeteaseFromAuthAttempt(context, credential, attemptCreatedAt),
    {
      leaseMs: options.config.providerAuthLeaseSeconds * 1_000,
      maxFailures: options.config.syncMaxAttempts,
      qrPollIntervalMs: options.config.providerAuthQrPollSeconds * 1_000,
      smsResendDelayMs: options.config.providerAuthSmsResendSeconds * 1_000
    }
  );
  let started = false;
  let workId: string | null = null;
  let authWorkId: string | null = null;

  return {
    async start() {
      if (started) return;
      await queueRuntime.start();
      workId = await queueRuntime.boss.work<SyncJobPayload>(
        SYNC_QUEUE_NAME,
        {
          batchSize: 1,
          localConcurrency: 1,
          pollingIntervalSeconds: options.config.syncPollIntervalSeconds
        },
        async ([job]) => {
          if (!job || !isSyncJobPayload(job.data)) {
            throw new Error("Sync queue payload is invalid.");
          }
          options.logger.info(
            { queueJobId: job.id, syncRunId: job.data.syncRunId },
            "SyncRun processing started"
          );
          const run = await service.process(job.data.syncRunId);
          options.logger.info(
            {
              attemptCount: run.attemptCount,
              provider: run.provider,
              queueJobId: job.id,
              status: run.status,
              syncRunId: run.id
            },
            "SyncRun processing finished"
          );
        }
      );
      authWorkId = await queueRuntime.boss.work<ProviderAuthJobPayload>(
        PROVIDER_AUTH_QUEUE_NAME,
        {
          batchSize: 1,
          localConcurrency: 1,
          pollingIntervalSeconds: options.config.syncPollIntervalSeconds
        },
        async ([job]) => {
          if (!job || !isProviderAuthJobPayload(job.data)) {
            throw new Error("Provider authentication queue payload is invalid.");
          }
          options.logger.info(
            { attemptId: job.data.attemptId, queueJobId: job.id },
            "Provider AuthAttempt processing started"
          );
          const result = await authService.process(job.data.attemptId);
          options.logger.info(
            {
              attemptId: result.attempt.id,
              method: result.attempt.method,
              queueJobId: job.id,
              status: result.attempt.status
            },
            "Provider AuthAttempt processing finished"
          );
        }
      );
      started = true;
      options.logger.info(
        { fixtureProviderEnabled: options.config.fixtureProviderEnabled, queue: SYNC_QUEUE_NAME },
        "Nivalis Worker ready"
      );
    },
    async stop() {
      if (!started) return;
      if (workId) {
        await queueRuntime.boss.offWork(SYNC_QUEUE_NAME, { id: workId, wait: true });
        workId = null;
      }
      if (authWorkId) {
        await queueRuntime.boss.offWork(PROVIDER_AUTH_QUEUE_NAME, {
          id: authWorkId,
          wait: true
        });
        authWorkId = null;
      }
      await queueRuntime.stop();
      if (ownsDatabase) await database.destroy();
      started = false;
      options.logger.info("Nivalis Worker stopped");
    }
  };
}

function createProviderComposition(
  config: WorkerConfig,
  database: NivalisDatabase,
  protector: AesGcmSecretProtector
) {
  const runtimes: ProviderRuntimeModule[] = [];
  const authRuntimes: ProviderAuthRuntimeModule[] = [];
  if (config.fixtureProviderEnabled) {
    runtimes.push(new FixtureProviderRuntime(() => config.fixtureScenario));
  }
  if (config.neteaseProviderEnabled) {
    const fetcher = config.neteaseHttpFixtureEnabled
      ? createNeteaseHttpFixtureFetcher(config.neteaseHttpFixtureScenario)
      : fetch;
    runtimes.push(
      new NeteaseProviderRuntime(
        new KyselyProviderCredentialResolver(database, protector),
        { timeoutMs: config.neteaseRequestTimeoutMs },
        fetcher
      )
    );
    authRuntimes.push(
      new NeteaseAuthClient({ timeoutMs: config.neteaseRequestTimeoutMs }, fetcher)
    );
  }
  return {
    auth: new StaticProviderAuthRuntimeRegistry(authRuntimes),
    sync: new StaticProviderRuntimeRegistry(runtimes)
  };
}

export class StaticProviderRuntimeRegistry implements ProviderRuntimeRegistry {
  private readonly runtimes: ReadonlyMap<ProviderType, ProviderRuntimeModule>;

  constructor(runtimes: readonly ProviderRuntimeModule[]) {
    this.runtimes = new Map(runtimes.map((runtime) => [runtime.provider, runtime]));
  }

  get(provider: ProviderType) {
    return this.runtimes.get(provider) ?? null;
  }
}

export class StaticProviderAuthRuntimeRegistry implements ProviderAuthRuntimeRegistry {
  private readonly runtimes: ReadonlyMap<"netease", ProviderAuthRuntimeModule>;

  constructor(runtimes: readonly ProviderAuthRuntimeModule[]) {
    this.runtimes = new Map(runtimes.map((runtime) => [runtime.provider, runtime]));
  }

  get(provider: "netease") {
    return this.runtimes.get(provider) ?? null;
  }
}

export class StaticProviderNativeStoreRegistry implements ProviderNativeStoreRegistry {
  private readonly stores: ReadonlyMap<ProviderType, ProviderNativeStore>;

  constructor(stores: readonly ProviderNativeStore[]) {
    this.stores = new Map(stores.map((store) => [store.provider, store]));
  }

  get(provider: ProviderType) {
    return this.stores.get(provider) ?? null;
  }
}

function isSyncJobPayload(value: unknown): value is SyncJobPayload {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { syncRunId?: unknown }).syncRunId === "string"
  );
}

function isProviderAuthJobPayload(value: unknown): value is ProviderAuthJobPayload {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { attemptId?: unknown }).attemptId === "string"
  );
}
