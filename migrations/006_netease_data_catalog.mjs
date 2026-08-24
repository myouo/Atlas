import { sql } from "kysely";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .alterTable("netease_metric_snapshots")
    .dropConstraint("netease_metric_snapshots_metric_ck")
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .addCheckConstraint(
      "netease_metric_snapshots_metric_ck",
      sql`metric in ('total_listen_count', 'listening_duration', 'listening_duration_total')`
    )
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .dropConstraint("netease_metric_snapshots_unit_ck")
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .addCheckConstraint(
      "netease_metric_snapshots_unit_ck",
      sql`unit in ('plays', 'minutes', 'seconds')`
    )
    .execute();
  await db.schema
    .createTable("provider_data_catalogs")
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.primaryKey().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull())
    .addColumn("data_version_id", "uuid", (column) => column.notNull())
    .addColumn("data", "jsonb", (column) => column.notNull())
    .addColumn("generated_at", "timestamptz", (column) => column.notNull())
    .addCheckConstraint("provider_data_catalogs_provider_ck", sql`provider = 'netease'`)
    .addCheckConstraint("provider_data_catalogs_schema_version_ck", sql`schema_version >= 1`)
    .execute();
  await db.schema
    .createIndex("provider_data_catalog_provider_generated_idx")
    .on("provider_data_catalogs")
    .columns(["provider", "generated_at"])
    .execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db.schema.dropTable("provider_data_catalogs").execute();
  await db
    .deleteFrom("netease_metric_snapshots")
    .where("metric", "=", "listening_duration_total")
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .dropConstraint("netease_metric_snapshots_metric_ck")
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .addCheckConstraint(
      "netease_metric_snapshots_metric_ck",
      sql`metric in ('total_listen_count', 'listening_duration')`
    )
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .dropConstraint("netease_metric_snapshots_unit_ck")
    .execute();
  await db.schema
    .alterTable("netease_metric_snapshots")
    .addCheckConstraint("netease_metric_snapshots_unit_ck", sql`unit in ('plays', 'minutes')`)
    .execute();
}
