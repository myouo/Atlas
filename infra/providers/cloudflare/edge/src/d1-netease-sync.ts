import {
  assertCompatibleNormalizedData,
  assertNormalizedProviderData,
  assertProviderNormalizationInput,
  assertProviderProjectionBatch,
  assertProviderProjectionInput,
  assertProviderProjectionSet,
  collectProviderData,
  providerRecordIdentity,
  unwrapProviderResult
} from "@nivalis/application";
import {
  NeteaseProviderRuntime,
  buildNeteaseOwnerDataCatalog,
  isNeteaseNormalizedPayload
} from "@nivalis/connectors";
import {
  encodeProviderSourceContext,
  ProviderAuthenticationError,
  ProviderCredentialError,
  ProviderNotConfiguredError,
  providerProtocolMetadata,
  ProviderSchemaMismatchError,
  providerSupportsCollectionMode,
  RetryableProviderError,
  toProviderSourceRecord,
  toProviderSnapshotRecord
} from "@nivalis/domain";
import type {
  JsonObject,
  JsonValue,
  NormalizedProviderData,
  ProjectionTarget,
  ProviderNormalizationInput,
  ProviderProjectionInput,
  ProviderSourceRecord,
  ProviderStatus,
  RawSnapshot,
  SyncRun,
  WidgetType
} from "@nivalis/domain";

import { CloudflareSyncJobQueue } from "./cloudflare-sync-queue";
import type { CloudflareQueueMessage } from "./cloudflare-sync-queue";
import {
  D1ProviderCredentialRepository,
  D1ProviderCredentialResolver
} from "./d1-provider-credential-repository";
import { createPortableProjectionKey } from "./projection-key";
import { decodeRawPayload, encodeRawPayload } from "./raw-payload-codec";
import type { WebCryptoSecretProtector } from "./web-crypto-auth";

interface SyncRunRow {
  readonly attempt_count: number;
  readonly finished_at: string | null;
  readonly id: string;
  readonly last_error_code: string | null;
  readonly last_error_message: string | null;
  readonly owner_id: string;
  readonly provider: "netease";
  readonly provider_connection_id: string;
  readonly queue_job_id: string | null;
  readonly requested_at: string;
  readonly started_at: string | null;
  readonly status: SyncRun["status"];
}

interface D1SyncRun extends SyncRun {
  readonly ownerId: string;
}

export interface D1SyncProcessResult {
  readonly disposition: "busy" | "processed";
  readonly run: SyncRun;
}

interface TargetRow {
  readonly data_config_json: string;
  readonly enabled: number;
  readonly presentation_config_json: string;
  readonly provider: "netease";
  readonly schema_version: number;
  readonly title: string;
  readonly widget_id: string;
  readonly widget_type: WidgetType;
}

interface ProviderStatusRow {
  readonly attempt_count: number | null;
  readonly credential_status: ProviderStatus["credentialStatus"] | null;
  readonly enabled: number;
  readonly last_attempt_at: string | null;
  readonly last_error_code: string | null;
  readonly last_error_message: string | null;
  readonly last_success_at: string | null;
  readonly sync_status:
    | "idle"
    | "queued"
    | "running"
    | "retry_wait"
    | "completed"
    | "failed"
    | "credential_invalid"
    | null;
}

interface ProviderDataCatalogRow {
  readonly data_json: string;
  readonly data_version_id: string;
  readonly generated_at: string;
  readonly schema_version: number;
}

interface NormalizedSnapshotRow {
  readonly message_json: string;
}

interface CachedHistoryRow {
  readonly created_at: string;
  readonly fetched_at: string;
  readonly id: string;
  readonly payload_hash: string;
  readonly payload_blob: ArrayBuffer | null;
  readonly payload_encoding: "gzip" | "json";
  readonly payload_json: string;
  readonly schema_version: number;
  readonly provider_connection_id: string;
  readonly source_cursor: string | null;
  readonly source_kind: string;
  readonly source_timestamp: string | null;
  readonly sync_run_id: string;
}

export class D1NeteaseSyncRuntime {
  private readonly credentials: D1ProviderCredentialRepository;
  private readonly runtime: NeteaseProviderRuntime;

  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareQueueMessage>,
    protector: WebCryptoSecretProtector,
    timeoutMs = 12_000,
    requestConcurrency = 3,
    fetcher: typeof fetch = fetch
  ) {
    this.credentials = new D1ProviderCredentialRepository(database);
    this.runtime = new NeteaseProviderRuntime(
      new D1ProviderCredentialResolver(this.credentials, protector),
      { requestConcurrency, timeoutMs },
      fetcher
    );
  }

  async enqueue(ownerId: string) {
    const id = crypto.randomUUID();
    const queueJobId = crypto.randomUUID();
    const now = new Date();
    const persistenceStartedAt = performance.now();
    const created = await this.database
      .prepare(
        `INSERT INTO provider_sync_runs
          (id, owner_id, provider, provider_connection_id, status, attempt_count,
           requested_at, started_at, finished_at, last_error_code, last_error_message, queue_job_id)
         SELECT ?, ?, 'netease', connection.id, 'queued', 0, ?, NULL, NULL, NULL, NULL, ?
           FROM provider_connections AS connection
          WHERE connection.owner_id = ?
            AND connection.provider = 'netease'
            AND connection.enabled = 1
            AND NOT EXISTS (
              SELECT 1 FROM provider_sync_runs AS active
               WHERE active.provider_connection_id = connection.id
                 AND active.status IN ('queued', 'running', 'retry_wait')
            )
         ON CONFLICT DO NOTHING
         RETURNING *`
      )
      .bind(id, ownerId, now.toISOString(), queueJobId, ownerId)
      .first<SyncRunRow>();
    const persistenceMs = performance.now() - persistenceStartedAt;
    if (created) {
      const queueStartedAt = performance.now();
      await new CloudflareSyncJobQueue(this.queue).enqueue(created.id, queueJobId);
      logEnqueueStages(persistenceMs, performance.now() - queueStartedAt, false, created.id);
      return mapRun(created);
    }

    const active = await this.database
      .prepare(
        `SELECT run.* FROM provider_sync_runs AS run
           JOIN provider_connections AS connection ON connection.id = run.provider_connection_id
          WHERE connection.owner_id = ? AND connection.provider = 'netease'
            AND connection.enabled = 1
            AND run.status IN ('queued', 'running', 'retry_wait')
          ORDER BY run.requested_at DESC LIMIT 1`
      )
      .bind(ownerId)
      .first<SyncRunRow>();
    if (!active) throw new ProviderNotConfiguredError("netease");
    let queueMs = 0;
    if (active.status === "queued" && active.queue_job_id) {
      const queueStartedAt = performance.now();
      await new CloudflareSyncJobQueue(this.queue).enqueue(active.id, active.queue_job_id);
      queueMs = performance.now() - queueStartedAt;
    }
    logEnqueueStages(persistenceMs, queueMs, true, active.id);
    return mapRun(active);
  }

  async getForOwner(ownerId: string, runId: string) {
    const row = await this.database
      .prepare("SELECT * FROM provider_sync_runs WHERE id = ? AND owner_id = ?")
      .bind(runId, ownerId)
      .first<SyncRunRow>();
    return row ? mapRun(row) : null;
  }

  async listProviderStatuses(ownerId: string): Promise<readonly ProviderStatus[]> {
    const row = await this.database
      .prepare(
        `SELECT connection.enabled,
                credential.status AS credential_status,
                state.status AS sync_status,
                state.attempt_count,
                state.last_attempt_at,
                state.last_success_at,
                state.last_error_code,
                state.last_error_message
           FROM provider_connections AS connection
           LEFT JOIN provider_credentials AS credential
             ON credential.provider_connection_id = connection.id
            AND credential.credential_type = 'music_u'
           LEFT JOIN provider_sync_states AS state
             ON state.provider_connection_id = connection.id
          WHERE connection.owner_id = ? AND connection.provider = 'netease'`
      )
      .bind(ownerId)
      .first<ProviderStatusRow>();
    const netease = mapNeteaseStatus(row ?? null);
    return [
      netease,
      ...(["github", "bangumi", "steam", "bilibili"] as const).map(disconnectedStatus)
    ];
  }

  async getOwnerDataCatalog(ownerId: string) {
    const row = await this.database
      .prepare(
        `SELECT catalog.schema_version, catalog.data_version_id,
                catalog.data_json, catalog.generated_at
           FROM provider_data_catalogs AS catalog
           JOIN provider_connections AS connection
             ON connection.id = catalog.provider_connection_id
          WHERE connection.owner_id = ? AND connection.provider = 'netease'
            AND catalog.provider = 'netease'
          LIMIT 1`
      )
      .bind(ownerId)
      .first<ProviderDataCatalogRow>();
    if (!row) return null;
    return {
      catalog: JSON.parse(row.data_json) as JsonObject,
      dataVersion: row.data_version_id,
      generatedAt: new Date(row.generated_at),
      provider: "netease" as const,
      schemaVersion: row.schema_version
    };
  }

  async process(runId: string): Promise<D1SyncProcessResult> {
    const startedAt = new Date();
    const staleBefore = new Date(startedAt.getTime() - SYNC_RUN_LEASE_MS);
    const claimedRow = await this.database
      .prepare(
        `UPDATE provider_sync_runs
            SET status = 'running', attempt_count = attempt_count + 1,
                started_at = ?, last_error_code = NULL,
                last_error_message = NULL
          WHERE id = ?
            AND (
              status IN ('queued', 'retry_wait')
              OR (status = 'running' AND (started_at IS NULL OR started_at <= ?))
            )
          RETURNING *`
      )
      .bind(startedAt.toISOString(), runId, staleBefore.toISOString())
      .first<SyncRunRow>();
    if (!claimedRow) {
      const current = await this.requireRun(runId);
      return {
        disposition:
          current.status === "completed" || current.status === "failed" ? "processed" : "busy",
        run: current
      };
    }
    if (!claimedRow.provider_connection_id) throw new Error("SyncRun has no Provider connection.");
    const run = mapRun(claimedRow);

    try {
      const processStartedAt = performance.now();
      const fetchStartedAt = performance.now();
      const cachedHistory = await this.cachedHistory(run.providerConnectionId).catch(
        (): readonly ProviderSourceRecord[] => []
      );
      const previousNormalized = providerSupportsCollectionMode(
        this.runtime.manifest,
        "incremental"
      )
        ? await this.previousNormalized(run)
        : null;
      const collection = await collectProviderData(this.runtime, run, {
        cachedRecords: cachedHistory,
        checkpoint: previousNormalized?.meta.checkpoint ?? null
      });
      const fetched = collection.records;
      const cachedIdentities = new Set(
        cachedHistory.map((record) =>
          providerRecordIdentity(record.meta.source, record.meta.partition)
        )
      );
      const historyCacheHits = fetched.filter((item) =>
        cachedIdentities.has(providerRecordIdentity(item.meta.source, item.meta.partition))
      ).length;
      const providerFetchMs = performance.now() - fetchStartedAt;
      const rawPersistStartedAt = performance.now();
      const preparedSnapshots = await Promise.all(
        fetched.map(async (result) => {
          const payloadJson = JSON.stringify(result.data);
          const stored = await encodeRawPayload(payloadJson);
          return {
            createdAt: new Date(),
            id: crypto.randomUUID(),
            payloadHash: await hashText(payloadJson),
            result,
            ...stored
          };
        })
      );
      if (preparedSnapshots.length > 0) {
        await this.database.batch(
          preparedSnapshots.map(
            ({ createdAt, id, payloadBlob, payloadEncoding, payloadHash, payloadJson, result }) =>
              this.database
                .prepare(
                  `INSERT INTO provider_raw_snapshots
              (id, sync_run_id, provider_connection_id, provider, source_kind,
               schema_version, payload_json, payload_hash, fetched_at,
               source_cursor, source_timestamp, created_at, payload_encoding, payload_blob)
             VALUES (?, ?, ?, 'netease', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(
                  id,
                  run.id,
                  run.providerConnectionId,
                  result.meta.source,
                  result.meta.schemaVersion,
                  payloadJson,
                  payloadHash,
                  result.meta.collectedAt,
                  encodeProviderSourceContext(result, collection),
                  result.meta.sourceUpdatedAt,
                  createdAt.toISOString(),
                  payloadEncoding,
                  payloadBlob
                )
          )
        );
      }
      const rawPersistMs = performance.now() - rawPersistStartedAt;
      const snapshots: RawSnapshot[] = preparedSnapshots.map(
        ({ createdAt, id, payloadHash, result }) => ({
          createdAt,
          fetchedAt: new Date(result.meta.collectedAt),
          id,
          payload: result.data,
          payloadHash,
          provider: "netease",
          providerConnectionId: run.providerConnectionId,
          schemaVersion: result.meta.schemaVersion,
          sourceCursor: encodeProviderSourceContext(result, collection),
          sourceKind: result.meta.source,
          sourceTimestamp: result.meta.sourceUpdatedAt
            ? new Date(result.meta.sourceUpdatedAt)
            : null,
          syncRunId: run.id
        })
      );

      const projectionStartedAt = performance.now();
      const normalizationRecords = snapshots.map(toProviderSnapshotRecord);
      const normalizationInput = {
        data: {
          checkpoint: collection.checkpoint,
          collectionMode: collection.mode,
          collectionOutcome: collection.outcome,
          issues: collection.issues,
          previous: collection.mode === "incremental" ? previousNormalized : null,
          records: normalizationRecords
        },
        meta: providerProtocolMetadata("normalization.request", run.provider, run.id)
      } satisfies ProviderNormalizationInput;
      assertProviderNormalizationInput(normalizationInput, this.runtime.manifest, run.id);
      const normalizationResult = await this.runtime.normalizer.normalize(normalizationInput);
      const normalized = unwrapProviderResult(normalizationResult, this.runtime.manifest, run.id);
      assertNormalizedProviderData(normalized, this.runtime.manifest, normalizationInput, run.id);
      const targets = await this.targets(run.ownerId);
      const projectionInput = {
        data: { normalized, targets },
        meta: providerProtocolMetadata("projection.request", run.provider, run.id)
      } satisfies ProviderProjectionInput;
      assertProviderProjectionInput(projectionInput, this.runtime.manifest, run.id);
      const projectionResult = await this.runtime.projector.project(projectionInput);
      const projectionBatch = unwrapProviderResult(projectionResult, this.runtime.manifest, run.id);
      assertProviderProjectionBatch(projectionBatch, this.runtime.manifest, run.id);
      const projections = projectionBatch.data;
      assertProviderProjectionSet(targets, projections, normalized);
      const projectionMs = performance.now() - projectionStartedAt;
      const completedAt = new Date();
      const projectionVersionId = crypto.randomUUID();
      const statements: D1PreparedStatement[] = projections.map((projection) =>
        this.database
          .prepare(
            `INSERT INTO widget_projections
              (widget_id, projection_key, projection_version_id, provider,
               projection_schema_version, data_json, stale, generated_at, last_success_at)
             VALUES (?, ?, ?, 'netease', ?, ?, 0, ?, ?)
             ON CONFLICT(widget_id, projection_key) DO UPDATE SET
               projection_version_id = excluded.projection_version_id,
               projection_schema_version = excluded.projection_schema_version,
               data_json = excluded.data_json,
               stale = 0,
               generated_at = excluded.generated_at,
               last_success_at = excluded.last_success_at`
          )
          .bind(
            projection.widgetId,
            projection.projectionKey,
            projectionVersionId,
            projection.projectionSchemaVersion,
            JSON.stringify(projection.data),
            completedAt.toISOString(),
            completedAt.toISOString()
          )
      );
      if (isNeteaseNormalizedPayload(normalized.data)) {
        statements.push(
          this.database
            .prepare(
              `INSERT INTO provider_data_catalogs
                (provider_connection_id, provider, schema_version,
                 data_version_id, data_json, generated_at)
               VALUES (?, 'netease', 1, ?, ?, ?)
               ON CONFLICT(provider_connection_id) DO UPDATE SET
                 schema_version = excluded.schema_version,
                 data_version_id = excluded.data_version_id,
                 data_json = excluded.data_json,
                 generated_at = excluded.generated_at`
            )
            .bind(
              run.providerConnectionId,
              projectionVersionId,
              JSON.stringify(buildNeteaseOwnerDataCatalog(normalized.data)),
              completedAt.toISOString()
            ),
          this.database
            .prepare(
              `INSERT INTO netease_accounts
                (provider_connection_id, provider_user_id, display_name, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(provider_connection_id) DO UPDATE SET
                 provider_user_id = excluded.provider_user_id,
                 display_name = excluded.display_name,
                 updated_at = excluded.updated_at`
            )
            .bind(
              run.providerConnectionId,
              normalized.data.account.providerUserId,
              normalized.data.account.displayName,
              completedAt.toISOString()
            ),
          this.database
            .prepare("UPDATE provider_connections SET account_key = ?, updated_at = ? WHERE id = ?")
            .bind(
              normalized.data.account.providerUserId,
              completedAt.toISOString(),
              run.providerConnectionId
            )
        );
      }
      statements.push(
        this.database
          .prepare(
            `INSERT INTO provider_normalized_snapshots
              (id, sync_run_id, provider_connection_id, provider, protocol_version,
               schema_id, schema_version, message_json, created_at)
             VALUES (?, ?, ?, 'netease', ?, ?, ?, ?, ?)
             ON CONFLICT(sync_run_id) DO NOTHING`
          )
          .bind(
            crypto.randomUUID(),
            run.id,
            run.providerConnectionId,
            normalized.meta.protocolVersion,
            normalized.meta.schemaId,
            normalized.meta.schemaVersion,
            JSON.stringify(normalized),
            completedAt.toISOString()
          ),
        this.database
          .prepare(
            `UPDATE provider_credentials
                SET status = 'valid', validated_at = ?, updated_at = ?
              WHERE provider_connection_id = ? AND credential_type = 'music_u'`
          )
          .bind(completedAt.toISOString(), completedAt.toISOString(), run.providerConnectionId),
        this.database
          .prepare(
            `UPDATE provider_sync_states
                SET status = 'completed', attempt_count = ?, last_attempt_at = ?,
                    last_success_at = ?, last_successful_run_id = ?,
                    last_error_at = NULL, last_error_code = NULL, last_error_message = NULL,
                    updated_at = ?
              WHERE provider_connection_id = ?`
          )
          .bind(
            run.attemptCount,
            startedAt.toISOString(),
            completedAt.toISOString(),
            run.id,
            completedAt.toISOString(),
            run.providerConnectionId
          ),
        this.database
          .prepare(
            `UPDATE provider_sync_runs
                SET status = 'completed', finished_at = ?, last_error_code = NULL,
                    last_error_message = NULL
              WHERE id = ?`
          )
          .bind(completedAt.toISOString(), run.id)
      );
      const commitStartedAt = performance.now();
      await this.database.batch(statements);
      const commitMs = performance.now() - commitStartedAt;
      const completed: D1SyncRun = {
        ...run,
        finishedAt: completedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        status: "completed"
      };
      console.info(
        JSON.stringify({
          commitMs: Math.round(commitMs),
          event: "netease_sync_completed",
          historyCacheHits,
          projectionMs: Math.round(projectionMs),
          providerFetchMs: Math.round(providerFetchMs),
          rawPersistMs: Math.round(rawPersistMs),
          requestToClaimMs: startedAt.getTime() - run.requestedAt.getTime(),
          snapshotCount: snapshots.length,
          syncRunId: run.id,
          totalMs: Math.round(performance.now() - processStartedAt)
        })
      );
      return { disposition: "processed", run: completed };
    } catch (error) {
      if (error instanceof RetryableProviderError && run.attemptCount < 3) {
        await this.markRetry(run, safeErrorCode(error));
        throw error;
      }
      const credentialInvalid =
        error instanceof ProviderCredentialError || error instanceof ProviderAuthenticationError;
      await this.markFailed(
        run,
        credentialInvalid ? "provider-credential-invalid" : safeErrorCode(error),
        credentialInvalid
      );
      return { disposition: "processed", run: await this.requireRun(run.id) };
    }
  }

  private async targets(ownerId: string): Promise<readonly ProjectionTarget[]> {
    const result = await this.database
      .prepare(
        `SELECT snapshot.widget_id, snapshot.widget_type, snapshot.provider,
                snapshot.schema_version, snapshot.title, snapshot.enabled,
                snapshot.data_config_json, snapshot.presentation_config_json
           FROM dashboard_revision_widgets AS snapshot
           JOIN dashboard_revisions AS revision ON revision.id = snapshot.revision_id
           JOIN dashboards AS dashboard ON dashboard.id = revision.dashboard_id
          WHERE dashboard.owner_id = ? AND snapshot.provider = 'netease'
            AND snapshot.revision_id IN (
              dashboard.current_draft_revision_id,
              dashboard.current_published_revision_id
            )`
      )
      .bind(ownerId)
      .all<TargetRow>();
    const targets = new Map<string, ProjectionTarget>();
    for (const row of result.results) {
      const dataConfig = JSON.parse(row.data_config_json) as JsonObject;
      const target: ProjectionTarget = {
        dataConfig,
        enabled: row.enabled === 1,
        id: row.widget_id,
        presentationConfig: JSON.parse(row.presentation_config_json) as JsonObject,
        projectionKey: await createPortableProjectionKey({
          dataConfig,
          schemaVersion: row.schema_version,
          type: row.widget_type
        }),
        provider: row.provider,
        schemaVersion: row.schema_version,
        title: row.title,
        type: row.widget_type
      };
      targets.set(`${target.id}:${target.projectionKey}`, target);
    }
    return [...targets.values()];
  }

  private async cachedHistory(
    providerConnectionId: string
  ): Promise<readonly ProviderSourceRecord[]> {
    const result = await this.database
      .prepare(
        `SELECT snapshot.id, snapshot.sync_run_id, snapshot.provider_connection_id,
                snapshot.source_kind, snapshot.schema_version, snapshot.payload_json,
                snapshot.payload_encoding, snapshot.payload_blob, snapshot.fetched_at,
                snapshot.source_cursor, snapshot.source_timestamp, snapshot.payload_hash,
                snapshot.created_at
           FROM provider_raw_snapshots AS snapshot
           JOIN provider_sync_states AS state
             ON state.last_successful_run_id = snapshot.sync_run_id
          WHERE state.provider_connection_id = ?
            AND (
              snapshot.source_kind = 'netease.listen_report.week.previous'
              OR snapshot.source_kind LIKE 'netease.listen_report.week.previous.period.%'
              OR snapshot.source_kind = 'netease.listen_report.month.previous'
              OR snapshot.source_kind LIKE 'netease.listen_report.month.previous.period.%'
            )`
      )
      .bind(providerConnectionId)
      .all<CachedHistoryRow>();
    return Promise.all(
      result.results.map(async (row) => {
        const snapshot: RawSnapshot = {
          createdAt: new Date(row.created_at),
          fetchedAt: new Date(row.fetched_at),
          id: row.id,
          payload: JSON.parse(
            await decodeRawPayload({
              payloadBlob: row.payload_blob,
              payloadEncoding: row.payload_encoding,
              payloadJson: row.payload_json
            })
          ) as JsonValue,
          payloadHash: row.payload_hash,
          provider: "netease",
          providerConnectionId: row.provider_connection_id,
          schemaVersion: row.schema_version,
          sourceCursor: row.source_cursor,
          sourceKind: row.source_kind,
          sourceTimestamp: row.source_timestamp ? new Date(row.source_timestamp) : null,
          syncRunId: row.sync_run_id
        };
        return toProviderSourceRecord(snapshot);
      })
    );
  }

  private async previousNormalized(run: D1SyncRun): Promise<NormalizedProviderData | null> {
    const row = await this.database
      .prepare(
        `SELECT normalized.message_json
           FROM provider_normalized_snapshots AS normalized
           JOIN provider_sync_runs AS previous_run
             ON previous_run.id = normalized.sync_run_id
          WHERE normalized.provider_connection_id = ?
            AND previous_run.id != ?
            AND previous_run.requested_at <= ?
          ORDER BY previous_run.requested_at DESC, normalized.created_at DESC
          LIMIT 1`
      )
      .bind(run.providerConnectionId, run.id, run.requestedAt.toISOString())
      .first<NormalizedSnapshotRow>();
    if (!row) return null;
    const parsed: unknown = JSON.parse(row.message_json);
    assertCompatibleNormalizedData(parsed, this.runtime.manifest);
    return parsed;
  }

  private async markRetry(run: SyncRun, code: string) {
    const now = new Date().toISOString();
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE provider_sync_runs
              SET status = 'retry_wait', last_error_code = ?,
                  last_error_message = 'The Provider request failed temporarily.'
            WHERE id = ?`
        )
        .bind(code, run.id),
      this.database
        .prepare(
          `UPDATE provider_sync_states
              SET status = 'retry_wait', attempt_count = ?, last_attempt_at = ?,
                  last_error_at = ?, last_error_code = ?,
                  last_error_message = 'The Provider request failed temporarily.',
                  updated_at = ?
            WHERE provider_connection_id = ?`
        )
        .bind(run.attemptCount, now, now, code, now, run.providerConnectionId)
    ]);
  }

  private async markFailed(run: SyncRun, code: string, credentialInvalid: boolean) {
    const now = new Date().toISOString();
    const statements = [
      this.database
        .prepare(
          `UPDATE provider_sync_runs
              SET status = 'failed', finished_at = ?, last_error_code = ?,
                  last_error_message = 'Provider synchronization failed.'
            WHERE id = ?`
        )
        .bind(now, code, run.id),
      this.database
        .prepare(
          `UPDATE provider_sync_states
              SET status = ?, attempt_count = ?, last_attempt_at = ?,
                  last_error_at = ?, last_error_code = ?,
                  last_error_message = 'Provider synchronization failed.', updated_at = ?
            WHERE provider_connection_id = ?`
        )
        .bind(
          credentialInvalid ? "credential_invalid" : "failed",
          run.attemptCount,
          now,
          now,
          code,
          now,
          run.providerConnectionId
        )
    ];
    if (credentialInvalid) {
      statements.push(
        this.database
          .prepare(
            `UPDATE provider_credentials
                SET status = 'invalid', updated_at = ?
              WHERE provider_connection_id = ? AND credential_type = 'music_u'`
          )
          .bind(now, run.providerConnectionId)
      );
    }
    await this.database.batch(statements);
  }

  private async requireRun(runId: string) {
    const row = await this.database
      .prepare("SELECT * FROM provider_sync_runs WHERE id = ?")
      .bind(runId)
      .first<SyncRunRow>();
    if (!row || !row.provider_connection_id) throw new Error("SyncRun does not exist.");
    return mapRun(row);
  }
}

const SYNC_RUN_LEASE_MS = 35_000;

function logEnqueueStages(
  persistenceMs: number,
  queueMs: number,
  reused: boolean,
  syncRunId: string
) {
  console.info(
    JSON.stringify({
      event: "netease_sync_enqueue_stages",
      persistenceMs: Math.round(persistenceMs),
      queueMs: Math.round(queueMs),
      reused,
      syncRunId
    })
  );
}

function mapRun(row: SyncRunRow): D1SyncRun {
  return {
    attemptCount: row.attempt_count,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    id: row.id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    ownerId: row.owner_id,
    provider: row.provider,
    providerConnectionId: row.provider_connection_id,
    queueJobId: row.queue_job_id,
    requestedAt: new Date(row.requested_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    status: row.status
  };
}

async function hashText(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeErrorCode(error: unknown) {
  if (error instanceof ProviderSchemaMismatchError) {
    const source = error.sourceKind.replaceAll(/[^a-z0-9._-]/gi, "").slice(0, 80);
    return source ? `${error.code}.${source}` : error.code;
  }
  if (error instanceof RetryableProviderError && error.diagnosticCode) {
    const diagnostic = error.diagnosticCode.replaceAll(/[^a-z0-9-]/gi, "").slice(0, 60);
    return diagnostic ? `${error.code}.${diagnostic}` : error.code;
  }
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 100);
  }
  return "provider-sync-failed";
}

function mapNeteaseStatus(row: ProviderStatusRow | null): ProviderStatus {
  if (!row) return disconnectedStatus("netease");
  const credentialStatus = row.credential_status ?? "not_configured";
  const syncStatus = row.sync_status === "retry_wait" ? "retrying" : (row.sync_status ?? "idle");
  return {
    attemptCount: row.attempt_count ?? 0,
    connection:
      row.enabled !== 1
        ? "disabled"
        : credentialStatus === "expired" || credentialStatus === "invalid"
          ? "requires_attention"
          : credentialStatus === "not_configured"
            ? "not_connected"
            : "connected",
    credentialStatus,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
    provider: "netease",
    syncStatus
  };
}

function disconnectedStatus(provider: ProviderStatus["provider"]): ProviderStatus {
  return {
    attemptCount: 0,
    connection: "not_connected",
    credentialStatus: "not_configured",
    lastAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastSuccessAt: null,
    provider,
    syncStatus: "idle"
  };
}
