import { createHash } from "node:crypto";

import { sql } from "kysely";

const providerValues = "'fixture', 'netease', 'github', 'bangumi', 'steam', 'bilibili'";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .createTable("provider_connections")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("owner_id", "uuid", (column) => column.notNull())
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("account_key", "varchar(120)", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("provider_connections_owner_provider_account_uq", [
      "owner_id",
      "provider",
      "account_key"
    ])
    .addUniqueConstraint("provider_connections_owner_id_id_uq", ["owner_id", "id"])
    .addCheckConstraint(
      "provider_connections_provider_ck",
      sql.raw(`provider in (${providerValues})`)
    )
    .execute();

  await db.schema
    .createTable("provider_sync_runs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("status", "varchar(24)", (column) => column.notNull())
    .addColumn("attempt_count", "integer", (column) => column.notNull())
    .addColumn("requested_at", "timestamptz", (column) => column.notNull())
    .addColumn("started_at", "timestamptz")
    .addColumn("finished_at", "timestamptz")
    .addColumn("last_error_code", "varchar(120)")
    .addColumn("last_error_message", "text")
    .addColumn("queue_job_id", "uuid")
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addCheckConstraint(
      "provider_sync_runs_provider_ck",
      sql.raw(`provider in (${providerValues})`)
    )
    .addCheckConstraint(
      "provider_sync_runs_status_ck",
      sql`status in ('queued', 'running', 'retry_wait', 'completed', 'failed')`
    )
    .addCheckConstraint("provider_sync_runs_attempt_count_ck", sql`attempt_count >= 0`)
    .execute();

  await sql`
    create unique index provider_sync_runs_active_uq
    on provider_sync_runs (provider_connection_id)
    where status in ('queued', 'running', 'retry_wait')
  `.execute(db);
  await db.schema
    .createIndex("provider_sync_runs_connection_requested_idx")
    .on("provider_sync_runs")
    .columns(["provider_connection_id", "requested_at"])
    .execute();

  await db.schema
    .createTable("provider_sync_states")
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.primaryKey().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("status", "varchar(24)", (column) => column.notNull())
    .addColumn("attempt_count", "integer", (column) => column.notNull())
    .addColumn("last_attempt_at", "timestamptz")
    .addColumn("last_success_at", "timestamptz")
    .addColumn("last_successful_run_id", "uuid", (column) =>
      column.references("provider_sync_runs.id").onDelete("set null")
    )
    .addColumn("last_error_code", "varchar(120)")
    .addColumn("last_error_message", "text")
    .addColumn("last_error_at", "timestamptz")
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addCheckConstraint(
      "provider_sync_states_provider_ck",
      sql.raw(`provider in (${providerValues})`)
    )
    .addCheckConstraint(
      "provider_sync_states_status_ck",
      sql`status in ('idle', 'queued', 'running', 'retry_wait', 'completed', 'failed')`
    )
    .addCheckConstraint("provider_sync_states_attempt_count_ck", sql`attempt_count >= 0`)
    .execute();

  await db.schema
    .createTable("provider_raw_snapshots")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("sync_run_id", "uuid", (column) =>
      column.notNull().references("provider_sync_runs.id").onDelete("cascade")
    )
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull())
    .addColumn("payload", "jsonb", (column) => column.notNull())
    .addColumn("payload_hash", "char(64)", (column) => column.notNull())
    .addColumn("source_cursor", "text")
    .addColumn("source_timestamp", "timestamptz")
    .addColumn("fetched_at", "timestamptz", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("provider_raw_snapshots_run_hash_uq", ["sync_run_id", "payload_hash"])
    .addCheckConstraint(
      "provider_raw_snapshots_provider_ck",
      sql.raw(`provider in (${providerValues})`)
    )
    .addCheckConstraint("provider_raw_snapshots_schema_version_ck", sql`schema_version >= 1`)
    .addCheckConstraint(
      "provider_raw_snapshots_payload_hash_ck",
      sql`payload_hash ~ '^[0-9a-f]{64}$'`
    )
    .execute();

  await db.schema
    .createIndex("provider_raw_snapshots_connection_fetched_idx")
    .on("provider_raw_snapshots")
    .columns(["provider_connection_id", "fetched_at"])
    .execute();

  await db.schema
    .createTable("widget_projections")
    .addColumn("widget_id", "uuid", (column) =>
      column.notNull().references("widgets.id").onDelete("cascade")
    )
    .addColumn("projection_key", "char(64)", (column) => column.notNull())
    .addColumn("projection_version_id", "uuid", (column) => column.notNull())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.references("provider_connections.id").onDelete("set null")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("projection_schema_version", "integer", (column) => column.notNull())
    .addColumn("data", "jsonb", (column) => column.notNull())
    .addColumn("source_snapshot_id", "uuid", (column) =>
      column.references("provider_raw_snapshots.id").onDelete("set null")
    )
    .addColumn("stale", "boolean", (column) => column.notNull())
    .addColumn("generated_at", "timestamptz", (column) => column.notNull())
    .addColumn("last_success_at", "timestamptz", (column) => column.notNull())
    .addPrimaryKeyConstraint("widget_projections_pk", ["widget_id", "projection_key"])
    .addCheckConstraint(
      "widget_projections_provider_ck",
      sql.raw(`provider in (${providerValues})`)
    )
    .addCheckConstraint("widget_projections_schema_version_ck", sql`projection_schema_version >= 1`)
    .addCheckConstraint(
      "widget_projections_projection_key_ck",
      sql`projection_key ~ '^[0-9a-f]{64}$'`
    )
    .execute();

  await db.schema
    .createIndex("widget_projections_connection_success_idx")
    .on("widget_projections")
    .columns(["provider_connection_id", "last_success_at"])
    .execute();

  await sql`
    create function nivalis_reject_raw_snapshot_update()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'Provider Raw Snapshots are immutable' using errcode = '55000';
    end
    $$
  `.execute(db);
  await sql`
    create trigger provider_raw_snapshots_immutable_update
    before update on provider_raw_snapshots
    for each row execute function nivalis_reject_raw_snapshot_update()
  `.execute(db);

  await sql`
    insert into provider_connections (
      id, owner_id, provider, account_key, enabled, created_at, updated_at
    )
    select
      md5(owner_id::text || ':fixture')::uuid,
      owner_id,
      'fixture',
      'development-fixture',
      false,
      min(created_at),
      max(updated_at)
    from dashboards
    group by owner_id
  `.execute(db);

  await sql`
    insert into provider_sync_states (
      provider_connection_id,
      provider,
      status,
      attempt_count,
      last_attempt_at,
      last_success_at,
      last_successful_run_id,
      last_error_code,
      last_error_message,
      last_error_at,
      updated_at
    )
    select
      connection.id,
      'fixture',
      'completed',
      0,
      max(snapshot.widget_updated_at),
      max(snapshot.widget_updated_at),
      null,
      null,
      null,
      null,
      max(snapshot.widget_updated_at)
    from provider_connections connection
    inner join dashboards dashboard on dashboard.owner_id = connection.owner_id
    inner join dashboard_revision_widgets snapshot on snapshot.dashboard_id = dashboard.id
    where connection.provider = 'fixture'
    group by connection.id
  `.execute(db);

  const rows = await db
    .selectFrom("dashboard_revision_widgets as snapshot")
    .innerJoin("dashboard_revisions as revision", "revision.id", "snapshot.revision_id")
    .innerJoin("dashboards as dashboard", "dashboard.id", "snapshot.dashboard_id")
    .innerJoin("provider_connections as connection", (join) =>
      join
        .onRef("connection.owner_id", "=", "dashboard.owner_id")
        .on("connection.provider", "=", "fixture")
    )
    .select([
      "snapshot.widget_id",
      "snapshot.widget_type",
      "snapshot.schema_version",
      "snapshot.config",
      "snapshot.projection_data",
      "snapshot.stale",
      "snapshot.widget_updated_at",
      "revision.id as revision_id",
      "revision.revision_number",
      "connection.id as connection_id"
    ])
    .orderBy("revision.revision_number", "asc")
    .execute();

  const latest = new Map();
  for (const row of rows) {
    const projectionKey = createProjectionKey(row.widget_type, row.schema_version, row.config);
    latest.set(`${row.widget_id}:${projectionKey}`, { ...row, projectionKey });
  }

  if (latest.size > 0) {
    await db
      .insertInto("widget_projections")
      .values(
        [...latest.values()].map((row) => ({
          widget_id: row.widget_id,
          projection_key: row.projectionKey,
          projection_version_id: row.revision_id,
          provider_connection_id: row.connection_id,
          provider: "fixture",
          projection_schema_version: row.schema_version,
          data: JSON.stringify(row.projection_data),
          source_snapshot_id: null,
          stale: row.stale,
          generated_at: row.widget_updated_at,
          last_success_at: row.widget_updated_at
        }))
      )
      .execute();
  }

  const projectionCount = await db
    .selectFrom("widget_projections")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirstOrThrow();
  if (Number(projectionCount.count) !== latest.size) {
    throw new Error("Phase 4 projection backfill count mismatch.");
  }

  // Flush Phase 2 -> Phase 3 deferred foreign-key checks when a fresh database
  // applies 002 and 003 in one migration transaction before altering the table.
  await sql`set constraints all immediate`.execute(db);

  await db.schema.alterTable("dashboard_revision_widgets").dropColumn("projection_data").execute();
  await db.schema.alterTable("dashboard_revision_widgets").dropColumn("stale").execute();
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .dropColumn("widget_updated_at")
    .execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .addColumn("projection_data", "jsonb")
    .execute();
  await db.schema.alterTable("dashboard_revision_widgets").addColumn("stale", "boolean").execute();
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .addColumn("widget_updated_at", "timestamptz")
    .execute();

  await sql`alter table dashboard_revision_widgets disable trigger dashboard_revision_widgets_immutable_update`.execute(
    db
  );
  const rows = await db
    .selectFrom("dashboard_revision_widgets as snapshot")
    .innerJoin("dashboard_revisions as revision", "revision.id", "snapshot.revision_id")
    .select([
      "snapshot.revision_id",
      "snapshot.widget_id",
      "snapshot.widget_type",
      "snapshot.schema_version",
      "snapshot.config",
      "revision.created_at"
    ])
    .execute();
  for (const row of rows) {
    const projectionKey = createProjectionKey(row.widget_type, row.schema_version, row.config);
    const projection = await db
      .selectFrom("widget_projections")
      .select(["data", "stale", "generated_at"])
      .where("widget_id", "=", row.widget_id)
      .where("projection_key", "=", projectionKey)
      .executeTakeFirst();
    await db
      .updateTable("dashboard_revision_widgets")
      .set({
        projection_data: JSON.stringify(projection?.data ?? null),
        stale: projection?.stale ?? true,
        widget_updated_at: projection?.generated_at ?? row.created_at
      })
      .where("revision_id", "=", row.revision_id)
      .where("widget_id", "=", row.widget_id)
      .execute();
  }
  await sql`alter table dashboard_revision_widgets enable trigger dashboard_revision_widgets_immutable_update`.execute(
    db
  );

  await db.schema
    .alterTable("dashboard_revision_widgets")
    .alterColumn("projection_data", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .alterColumn("stale", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .alterColumn("widget_updated_at", (column) => column.setNotNull())
    .execute();

  await db.schema.dropTable("widget_projections").execute();
  await db.schema.dropTable("provider_raw_snapshots").execute();
  await sql`drop function nivalis_reject_raw_snapshot_update()`.execute(db);
  await db.schema.dropTable("provider_sync_states").execute();
  await db.schema.dropTable("provider_sync_runs").execute();
  await db.schema.dropTable("provider_connections").execute();
}

function createProjectionKey(widgetType, schemaVersion, config) {
  return createHash("sha256")
    .update(canonicalJson({ config, schemaVersion, type: widgetType }))
    .digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
