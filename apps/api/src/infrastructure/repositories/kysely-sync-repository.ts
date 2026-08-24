import { randomUUID } from "node:crypto";

import type {
  CommitProjectionReplayInput,
  CompleteSyncInput,
  CreateSyncRunResult,
  RawSnapshotInput,
  ProviderNativeStoreRegistry,
  SyncRepository,
  SyncUnitOfWork
} from "@nivalis/application";
import type {
  ProviderConnection,
  ProviderSyncState,
  ProviderType,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";
import { type Kysely, type Selectable, sql, type Transaction } from "kysely";

import type {
  Database,
  ProviderConnectionsTable,
  ProviderRawSnapshotsTable,
  ProviderSyncRunsTable,
  ProviderSyncStatesTable
} from "../database/schema";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export class KyselySyncRepository implements SyncRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async findConnectionForOwnerProvider(ownerId: string, provider: ProviderType) {
    const row = await this.database
      .selectFrom("provider_connections")
      .selectAll()
      .where("owner_id", "=", ownerId)
      .where("provider", "=", provider)
      .executeTakeFirst();
    return row ? mapConnection(row) : null;
  }

  async getConnection(providerConnectionId: string) {
    const row = await this.database
      .selectFrom("provider_connections")
      .selectAll()
      .where("id", "=", providerConnectionId)
      .executeTakeFirst();
    return row ? mapConnection(row) : null;
  }

  async createOrGetActiveRun(
    connection: ProviderConnection,
    now: Date
  ): Promise<CreateSyncRunResult> {
    const existing = await this.findActiveRun(connection.id);
    if (existing) return { created: false, run: existing };

    const id = randomUUID();
    const inserted = await this.database
      .insertInto("provider_sync_runs")
      .values({
        attempt_count: 0,
        created_at: now,
        finished_at: null,
        id,
        last_error_code: null,
        last_error_message: null,
        provider: connection.provider,
        provider_connection_id: connection.id,
        queue_job_id: null,
        requested_at: now,
        started_at: null,
        status: "queued",
        updated_at: now
      })
      .onConflict((conflict) => conflict.doNothing())
      .returningAll()
      .executeTakeFirst();
    if (!inserted) {
      const raced = await this.findActiveRun(connection.id);
      if (!raced) throw new Error("Active SyncRun deduplication failed.");
      return { created: false, run: raced };
    }
    await this.database
      .insertInto("provider_sync_states")
      .values({
        attempt_count: 0,
        last_attempt_at: now,
        last_error_at: null,
        last_error_code: null,
        last_error_message: null,
        last_success_at: null,
        last_successful_run_id: null,
        provider: connection.provider,
        provider_connection_id: connection.id,
        status: "queued",
        updated_at: now
      })
      .onConflict((conflict) =>
        conflict.column("provider_connection_id").doUpdateSet({
          attempt_count: 0,
          last_attempt_at: now,
          last_error_at: null,
          last_error_code: null,
          last_error_message: null,
          status: "queued",
          updated_at: now
        })
      )
      .execute();
    return { created: true, run: mapRun(inserted) };
  }

  async attachQueueJob(syncRunId: string, queueJobId: string, now: Date) {
    const row = await this.database
      .updateTable("provider_sync_runs")
      .set({ queue_job_id: queueJobId, updated_at: now })
      .where("id", "=", syncRunId)
      .where("status", "=", "queued")
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapRun(row);
  }

  async getRun(syncRunId: string) {
    const row = await this.database
      .selectFrom("provider_sync_runs")
      .selectAll()
      .where("id", "=", syncRunId)
      .executeTakeFirst();
    return row ? mapRun(row) : null;
  }

  async getRunForOwner(ownerId: string, syncRunId: string) {
    const row = await this.database
      .selectFrom("provider_sync_runs as run")
      .innerJoin(
        "provider_connections as connection",
        "connection.id",
        "run.provider_connection_id"
      )
      .selectAll("run")
      .where("connection.owner_id", "=", ownerId)
      .where("run.id", "=", syncRunId)
      .executeTakeFirst();
    return row ? mapRun(row) : null;
  }

  async claimRun(syncRunId: string, now: Date, staleBefore: Date) {
    const run = await this.database
      .updateTable("provider_sync_runs")
      .set({
        attempt_count: (expression) => expression("attempt_count", "+", 1),
        last_error_code: null,
        last_error_message: null,
        started_at: sql<Date>`coalesce(started_at, ${now})`,
        status: "running",
        updated_at: now
      })
      .where("id", "=", syncRunId)
      .where((expression) =>
        expression.or([
          expression("status", "in", ["queued", "retry_wait"]),
          expression.and([
            expression("status", "=", "running"),
            expression("updated_at", "<=", staleBefore)
          ])
        ])
      )
      .returningAll()
      .executeTakeFirst();
    if (!run) return null;
    await this.database
      .updateTable("provider_sync_states")
      .set({
        attempt_count: run.attempt_count,
        last_attempt_at: now,
        last_error_at: null,
        last_error_code: null,
        last_error_message: null,
        status: "running",
        updated_at: now
      })
      .where("provider_connection_id", "=", run.provider_connection_id)
      .execute();
    return mapRun(run);
  }

  async insertRawSnapshot(input: RawSnapshotInput, now: Date): Promise<RawSnapshot> {
    const id = randomUUID();
    const inserted = await this.database
      .insertInto("provider_raw_snapshots")
      .values({
        created_at: now,
        fetched_at: input.fetchedAt,
        id,
        payload: JSON.stringify(input.payload),
        payload_hash: input.payloadHash,
        provider: input.provider,
        provider_connection_id: input.providerConnectionId,
        schema_version: input.schemaVersion,
        source_cursor: input.sourceCursor ?? null,
        source_kind: input.sourceKind,
        source_timestamp: input.sourceTimestamp ?? null,
        sync_run_id: input.syncRunId
      })
      .onConflict((conflict) =>
        conflict.columns(["sync_run_id", "source_kind", "payload_hash"]).doNothing()
      )
      .returningAll()
      .executeTakeFirst();
    const row =
      inserted ??
      (await this.database
        .selectFrom("provider_raw_snapshots")
        .selectAll()
        .where("sync_run_id", "=", input.syncRunId)
        .where("source_kind", "=", input.sourceKind)
        .where("payload_hash", "=", input.payloadHash)
        .executeTakeFirstOrThrow());
    return mapRawSnapshot(row);
  }

  async getRawSnapshot(snapshotId: string) {
    const row = await this.database
      .selectFrom("provider_raw_snapshots")
      .selectAll()
      .where("id", "=", snapshotId)
      .executeTakeFirst();
    return row ? mapRawSnapshot(row) : null;
  }

  async listRawSnapshotsForRun(syncRunId: string) {
    const rows = await this.database
      .selectFrom("provider_raw_snapshots")
      .selectAll()
      .where("sync_run_id", "=", syncRunId)
      .orderBy("created_at", "asc")
      .orderBy("id", "asc")
      .execute();
    return rows.map(mapRawSnapshot);
  }

  async completeRun(input: CompleteSyncInput) {
    await this.upsertProjections(input);
    const run = await this.database
      .updateTable("provider_sync_runs")
      .set({
        finished_at: input.generatedAt,
        last_error_code: null,
        last_error_message: null,
        status: "completed",
        updated_at: input.generatedAt
      })
      .where("id", "=", input.syncRunId)
      .where("status", "=", "running")
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.database
      .updateTable("provider_sync_states")
      .set({
        attempt_count: run.attempt_count,
        last_error_at: null,
        last_error_code: null,
        last_error_message: null,
        last_success_at: input.generatedAt,
        last_successful_run_id: input.syncRunId,
        status: "completed",
        updated_at: input.generatedAt
      })
      .where("provider_connection_id", "=", input.providerConnectionId)
      .executeTakeFirstOrThrow();
    return mapRun(run);
  }

  async commitProjectionReplay(input: CommitProjectionReplayInput) {
    await this.upsertProjections(input);
  }

  markRetryWait(syncRunId: string, errorCode: string, errorMessage: string, now: Date) {
    return this.markRun("retry_wait", syncRunId, errorCode, errorMessage, now);
  }

  markFailed(syncRunId: string, errorCode: string, errorMessage: string, now: Date) {
    return this.markRun("failed", syncRunId, errorCode, errorMessage, now);
  }

  async markCredentialStatus(
    providerConnectionId: string,
    status: "expired" | "invalid" | "valid",
    now: Date
  ) {
    await this.database
      .updateTable("provider_credentials")
      .set({ status, updated_at: now, ...(status === "valid" ? { validated_at: now } : {}) })
      .where("provider_connection_id", "=", providerConnectionId)
      .execute();
    if (status !== "valid") {
      await this.database
        .updateTable("provider_sync_states")
        .set({ status: "credential_invalid", updated_at: now })
        .where("provider_connection_id", "=", providerConnectionId)
        .execute();
    }
  }

  async listProviderStates(ownerId: string): Promise<readonly ProviderSyncState[]> {
    const rows = await this.database
      .selectFrom("provider_sync_states as state")
      .innerJoin(
        "provider_connections as connection",
        "connection.id",
        "state.provider_connection_id"
      )
      .leftJoin(
        "provider_credentials as credential",
        "credential.provider_connection_id",
        "state.provider_connection_id"
      )
      .selectAll("state")
      .select([
        "credential.status as credential_status",
        "connection.enabled as connection_enabled"
      ])
      .where("connection.owner_id", "=", ownerId)
      .execute();
    return rows.map((row) =>
      mapSyncState(
        row,
        row.provider === "fixture" ? "valid" : (row.credential_status ?? "not_configured"),
        row.connection_enabled
      )
    );
  }

  private async findActiveRun(providerConnectionId: string) {
    const row = await this.database
      .selectFrom("provider_sync_runs")
      .selectAll()
      .where("provider_connection_id", "=", providerConnectionId)
      .where("status", "in", ["queued", "running", "retry_wait"])
      .orderBy("requested_at", "desc")
      .executeTakeFirst();
    return row ? mapRun(row) : null;
  }

  private async upsertProjections(input: CommitProjectionReplayInput) {
    for (const projection of input.projections) {
      await this.database
        .insertInto("widget_projections")
        .values({
          data: JSON.stringify(projection.data),
          generated_at: input.generatedAt,
          last_success_at: input.generatedAt,
          projection_key: projection.projectionKey,
          projection_schema_version: projection.projectionSchemaVersion,
          projection_version_id: input.projectionVersionId,
          provider: input.provider,
          provider_connection_id: input.providerConnectionId,
          source_snapshot_id: projection.sourceSnapshotId ?? input.sourceSnapshotId,
          stale: false,
          widget_id: projection.widgetId
        })
        .onConflict((conflict) =>
          conflict.columns(["widget_id", "projection_key"]).doUpdateSet({
            data: JSON.stringify(projection.data),
            generated_at: input.generatedAt,
            last_success_at: input.generatedAt,
            projection_schema_version: projection.projectionSchemaVersion,
            projection_version_id: input.projectionVersionId,
            provider: input.provider,
            provider_connection_id: input.providerConnectionId,
            source_snapshot_id: projection.sourceSnapshotId ?? input.sourceSnapshotId,
            stale: false
          })
        )
        .execute();
    }
  }

  private async markRun(
    status: "retry_wait" | "failed",
    syncRunId: string,
    errorCode: string,
    errorMessage: string,
    now: Date
  ) {
    const run = await this.database
      .updateTable("provider_sync_runs")
      .set({
        ...(status === "failed" ? { finished_at: now } : {}),
        last_error_code: errorCode,
        last_error_message: safeMessage(errorMessage),
        status,
        updated_at: now
      })
      .where("id", "=", syncRunId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.database
      .updateTable("provider_sync_states")
      .set({
        attempt_count: run.attempt_count,
        last_error_at: now,
        last_error_code: errorCode,
        last_error_message: safeMessage(errorMessage),
        status,
        updated_at: now
      })
      .where("provider_connection_id", "=", run.provider_connection_id)
      .executeTakeFirstOrThrow();
    return mapRun(run);
  }
}

export class KyselySyncUnitOfWork implements SyncUnitOfWork {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly nativeStores: (
      transaction: Transaction<Database>
    ) => ProviderNativeStoreRegistry = () => EMPTY_NATIVE_STORES
  ) {}

  run<T>(
    work: (repository: SyncRepository, nativeStores: ProviderNativeStoreRegistry) => Promise<T>
  ): Promise<T> {
    return this.database
      .transaction()
      .execute((transaction) =>
        work(new KyselySyncRepository(transaction), this.nativeStores(transaction))
      );
  }
}

function mapConnection(row: Selectable<ProviderConnectionsTable>): ProviderConnection {
  return {
    accountKey: row.account_key,
    enabled: row.enabled,
    id: row.id,
    ownerId: row.owner_id,
    provider: row.provider
  };
}

function mapRun(row: Selectable<ProviderSyncRunsTable>): SyncRun {
  return {
    attemptCount: row.attempt_count,
    finishedAt: row.finished_at,
    id: row.id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    provider: row.provider,
    providerConnectionId: row.provider_connection_id,
    queueJobId: row.queue_job_id,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    status: row.status
  };
}

function mapSyncState(
  row: Selectable<ProviderSyncStatesTable>,
  credentialStatus: ProviderSyncState["credentialStatus"],
  connectionEnabled: boolean
): ProviderSyncState {
  return {
    attemptCount: row.attempt_count,
    connectionEnabled,
    credentialStatus,
    lastAttemptAt: row.last_attempt_at,
    lastErrorAt: row.last_error_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    lastSuccessAt: row.last_success_at,
    lastSuccessfulRunId: row.last_successful_run_id,
    provider: row.provider,
    providerConnectionId: row.provider_connection_id,
    status: row.status
  };
}

function mapRawSnapshot(row: Selectable<ProviderRawSnapshotsTable>): RawSnapshot {
  return {
    createdAt: row.created_at,
    fetchedAt: row.fetched_at,
    id: row.id,
    payload: row.payload,
    payloadHash: row.payload_hash.trim(),
    provider: row.provider,
    providerConnectionId: row.provider_connection_id,
    schemaVersion: row.schema_version,
    sourceCursor: row.source_cursor,
    sourceKind: row.source_kind,
    sourceTimestamp: row.source_timestamp,
    syncRunId: row.sync_run_id
  };
}

const EMPTY_NATIVE_STORES: ProviderNativeStoreRegistry = {
  get: () => null
};

function safeMessage(message: string) {
  return message.slice(0, 1_000);
}
