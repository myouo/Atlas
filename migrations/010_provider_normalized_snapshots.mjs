import { sql } from "kysely";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .createTable("provider_normalized_snapshots")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("sync_run_id", "uuid", (column) =>
      column.notNull().unique().references("provider_sync_runs.id").onDelete("cascade")
    )
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("protocol_version", "varchar(16)", (column) => column.notNull())
    .addColumn("schema_id", "varchar(320)", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull())
    .addColumn("message", "jsonb", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addCheckConstraint(
      "provider_normalized_snapshots_provider_ck",
      sql`provider in ('fixture', 'netease', 'github', 'bangumi', 'steam', 'bilibili')`
    )
    .addCheckConstraint("provider_normalized_snapshots_protocol_ck", sql`protocol_version = '2.0'`)
    .addCheckConstraint("provider_normalized_snapshots_schema_version_ck", sql`schema_version >= 1`)
    .addCheckConstraint(
      "provider_normalized_snapshots_message_ck",
      sql`
        coalesce(
          jsonb_typeof(message) = 'object'
          and message #>> '{meta,kind}' = 'normalization.result'
          and message #>> '{meta,protocol}' = 'nivalis.provider-data'
          and message #>> '{meta,protocolVersion}' = protocol_version
          and message #>> '{meta,provider}' = provider
          and message #>> '{meta,schemaId}' = schema_id
          and (message #>> '{meta,schemaVersion}')::integer = schema_version,
          false
        )
      `
    )
    .execute();

  await db.schema
    .createIndex("provider_normalized_snapshots_connection_created_idx")
    .on("provider_normalized_snapshots")
    .columns(["provider_connection_id", "created_at"])
    .execute();

  await sql`
    create function nivalis_reject_normalized_snapshot_update()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'Provider Normalized Snapshots are immutable' using errcode = '55000';
    end
    $$
  `.execute(db);
  await sql`
    create trigger provider_normalized_snapshots_immutable_update
    before update on provider_normalized_snapshots
    for each row execute function nivalis_reject_normalized_snapshot_update()
  `.execute(db);
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db.schema.dropTable("provider_normalized_snapshots").execute();
  await sql`drop function nivalis_reject_normalized_snapshot_update()`.execute(db);
}
