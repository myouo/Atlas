import { sql } from "kysely";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .alterTable("netease_track_play_snapshots")
    .dropConstraint("netease_track_play_snapshots_period_ck")
    .execute();
  await db.schema
    .alterTable("netease_track_play_snapshots")
    .addCheckConstraint(
      "netease_track_play_snapshots_period_ck",
      sql`period in ('week', 'month', 'all_time')`
    )
    .execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db.deleteFrom("netease_track_play_snapshots").where("period", "=", "month").execute();
  await db.schema
    .alterTable("netease_track_play_snapshots")
    .dropConstraint("netease_track_play_snapshots_period_ck")
    .execute();
  await db.schema
    .alterTable("netease_track_play_snapshots")
    .addCheckConstraint(
      "netease_track_play_snapshots_period_ck",
      sql`period in ('week', 'all_time')`
    )
    .execute();
}
