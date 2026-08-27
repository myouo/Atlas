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
      sql`metric in ('total_listen_count', 'listening_duration', 'listening_duration_month', 'listening_duration_total')`
    )
    .execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db
    .deleteFrom("netease_metric_snapshots")
    .where("metric", "=", "listening_duration_month")
    .execute();
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
}
