import type {
  ProviderAuthAttemptRepository,
  ProviderAuthEnqueueUnitOfWork,
  ProviderAuthJobQueue,
  SyncEnqueueUnitOfWork,
  SyncJobQueue,
  SyncRepository
} from "@nivalis/application";
import { PgBoss, fromKysely } from "pg-boss";
import type { Kysely, Transaction } from "kysely";

import type { Database } from "../database/schema";
import { KyselySyncRepository } from "../repositories/kysely-sync-repository";
import { KyselyProviderAuthAttemptRepository } from "../repositories/kysely-provider-auth-repository";

export const SYNC_QUEUE_NAME = "nivalis-provider-sync";
export const PROVIDER_AUTH_QUEUE_NAME = "nivalis-provider-auth";

export interface PgBossRuntimeOptions {
  readonly connectionString: string;
  readonly deleteAfterSeconds: number;
  readonly expireInSeconds: number;
  readonly retryDelay: number;
  readonly retryDelayMax: number;
  readonly retryLimit: number;
  readonly schema: string;
}

export class PgBossRuntime {
  readonly boss: PgBoss;
  private started = false;

  constructor(
    private readonly options: PgBossRuntimeOptions,
    onError: (error: Error) => void
  ) {
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      schedule: false,
      schema: options.schema
    });
    this.boss.on("error", onError);
  }

  async start() {
    if (this.started) return;
    await this.boss.start();
    const queueOptions = {
      deleteAfterSeconds: this.options.deleteAfterSeconds,
      expireInSeconds: this.options.expireInSeconds,
      heartbeatSeconds: Math.max(10, Math.floor(this.options.expireInSeconds / 3)),
      retryBackoff: true,
      retryDelay: this.options.retryDelay,
      retryDelayMax: this.options.retryDelayMax,
      retryLimit: this.options.retryLimit
    };
    for (const queueName of [SYNC_QUEUE_NAME, PROVIDER_AUTH_QUEUE_NAME]) {
      if (await this.boss.getQueue(queueName)) {
        await this.boss.updateQueue(queueName, queueOptions);
      } else {
        await this.boss.createQueue(queueName, queueOptions);
      }
    }
    this.started = true;
  }

  async stop() {
    if (!this.started) return;
    await this.boss.stop({ graceful: true });
    this.started = false;
  }
}

export class PgBossProviderAuthJobQueue implements ProviderAuthJobQueue {
  constructor(
    private readonly boss: PgBoss,
    private readonly transaction?: Transaction<Database>
  ) {}

  async enqueue(attemptId: string, delaySeconds = 0) {
    const options = this.transaction ? { db: fromKysely(this.transaction) } : undefined;
    const jobId =
      delaySeconds > 0
        ? await this.boss.sendAfter(
            PROVIDER_AUTH_QUEUE_NAME,
            { attemptId },
            options ?? null,
            delaySeconds
          )
        : await this.boss.send(PROVIDER_AUTH_QUEUE_NAME, { attemptId }, options);
    if (!jobId) throw new Error("pg-boss did not create a Provider AuthAttempt job.");
    return jobId;
  }
}

export class PgBossSyncJobQueue implements SyncJobQueue {
  constructor(
    private readonly boss: PgBoss,
    private readonly transaction?: Transaction<Database>
  ) {}

  async enqueue(syncRunId: string) {
    const jobId = await this.boss.send(
      SYNC_QUEUE_NAME,
      { syncRunId },
      this.transaction ? { db: fromKysely(this.transaction) } : undefined
    );
    if (!jobId) throw new Error("pg-boss did not create a SyncRun job.");
    return jobId;
  }
}

export class KyselySyncEnqueueUnitOfWork implements SyncEnqueueUnitOfWork {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly boss: PgBoss
  ) {}

  run<T>(work: (repository: SyncRepository, queue: SyncJobQueue) => Promise<T>): Promise<T> {
    return this.database
      .transaction()
      .execute((transaction) =>
        work(new KyselySyncRepository(transaction), new PgBossSyncJobQueue(this.boss, transaction))
      );
  }
}

export class KyselyProviderAuthEnqueueUnitOfWork implements ProviderAuthEnqueueUnitOfWork {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly boss: PgBoss
  ) {}

  run<T>(
    work: (repository: ProviderAuthAttemptRepository, queue: ProviderAuthJobQueue) => Promise<T>
  ): Promise<T> {
    return this.database
      .transaction()
      .execute((transaction) =>
        work(
          new KyselyProviderAuthAttemptRepository(transaction),
          new PgBossProviderAuthJobQueue(this.boss, transaction)
        )
      );
  }
}
