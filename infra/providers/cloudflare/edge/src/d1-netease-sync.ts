import { NeteaseProviderRuntime, isNeteaseNormalizedPayload } from "@nivalis/connectors";
import {
  ProviderAuthenticationError,
  ProviderCredentialError,
  ProviderNotConfiguredError,
  RetryableProviderError
} from "@nivalis/domain";
import type {
  JsonObject,
  ProjectionTarget,
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

export class D1NeteaseSyncRuntime {
  private readonly credentials: D1ProviderCredentialRepository;
  private readonly runtime: NeteaseProviderRuntime;

  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareQueueMessage>,
    protector: WebCryptoSecretProtector,
    timeoutMs = 12_000,
    fetcher: typeof fetch = fetch
  ) {
    this.credentials = new D1ProviderCredentialRepository(database);
    this.runtime = new NeteaseProviderRuntime(
      new D1ProviderCredentialResolver(this.credentials, protector),
      { timeoutMs },
      fetcher
    );
  }

  async enqueue(ownerId: string) {
    const connection = await this.credentials.findEnabledConnectionForOwner(ownerId);
    if (!connection) throw new ProviderNotConfiguredError("netease");
    const active = await this.database
      .prepare(
        `SELECT * FROM provider_sync_runs
          WHERE owner_id = ? AND provider = 'netease'
            AND status IN ('queued', 'running', 'retry_wait')
          ORDER BY requested_at DESC LIMIT 1`
      )
      .bind(ownerId)
      .first<SyncRunRow>();
    if (active) return mapRun(active);

    const id = crypto.randomUUID();
    const now = new Date();
    await this.database
      .prepare(
        `INSERT INTO provider_sync_runs
          (id, owner_id, provider, provider_connection_id, status, attempt_count,
           requested_at, started_at, finished_at, last_error_code, last_error_message, queue_job_id)
         VALUES (?, ?, 'netease', ?, 'queued', 0, ?, NULL, NULL, NULL, NULL, NULL)`
      )
      .bind(id, ownerId, connection.id, now.toISOString())
      .run();
    const queueJobId = await new CloudflareSyncJobQueue(this.queue).enqueue(id);
    await this.database
      .prepare("UPDATE provider_sync_runs SET queue_job_id = ? WHERE id = ?")
      .bind(queueJobId, id)
      .run();
    return this.requireRun(id);
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

  async process(runId: string) {
    const initial = await this.requireRun(runId);
    if (initial.status === "completed" || initial.status === "failed") return initial;
    const startedAt = new Date();
    await this.database
      .prepare(
        `UPDATE provider_sync_runs
            SET status = 'running', attempt_count = attempt_count + 1,
                started_at = COALESCE(started_at, ?), last_error_code = NULL,
                last_error_message = NULL
          WHERE id = ? AND status IN ('queued', 'retry_wait', 'running')`
      )
      .bind(startedAt.toISOString(), runId)
      .run();
    const run = await this.requireRun(runId);

    try {
      const fetched = await this.runtime.connector.fetch(run);
      const snapshots: RawSnapshot[] = [];
      for (const result of fetched) {
        const id = crypto.randomUUID();
        const payloadHash = await hashJson(result.payload);
        const createdAt = new Date();
        await this.database
          .prepare(
            `INSERT INTO provider_raw_snapshots
              (id, sync_run_id, provider_connection_id, provider, source_kind,
               schema_version, payload_json, payload_hash, fetched_at,
               source_cursor, source_timestamp, created_at)
             VALUES (?, ?, ?, 'netease', ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            run.id,
            run.providerConnectionId,
            result.sourceKind,
            result.schemaVersion,
            JSON.stringify(result.payload),
            payloadHash,
            result.fetchedAt.toISOString(),
            result.sourceCursor ?? null,
            result.sourceTimestamp?.toISOString() ?? null,
            createdAt.toISOString()
          )
          .run();
        snapshots.push({
          createdAt,
          fetchedAt: result.fetchedAt,
          id,
          payload: result.payload,
          payloadHash,
          provider: "netease",
          providerConnectionId: run.providerConnectionId,
          schemaVersion: result.schemaVersion,
          sourceCursor: result.sourceCursor ?? null,
          sourceKind: result.sourceKind,
          sourceTimestamp: result.sourceTimestamp ?? null,
          syncRunId: run.id
        });
      }

      const normalized = await this.runtime.normalizer.normalize(snapshots);
      const targets = await this.targets(run.ownerId);
      const projections = await this.runtime.projector.project(normalized, targets);
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
      if (isNeteaseNormalizedPayload(normalized.payload)) {
        statements.push(
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
              normalized.payload.account.providerUserId,
              normalized.payload.account.displayName,
              completedAt.toISOString()
            ),
          this.database
            .prepare("UPDATE provider_connections SET account_key = ?, updated_at = ? WHERE id = ?")
            .bind(
              normalized.payload.account.providerUserId,
              completedAt.toISOString(),
              run.providerConnectionId
            )
        );
      }
      statements.push(
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
      await this.database.batch(statements);
      return this.requireRun(run.id);
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
      return this.requireRun(run.id);
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

async function hashJson(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value))
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeErrorCode(error: unknown) {
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
