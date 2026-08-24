import { sql } from "kysely";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .createTable("profiles")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("owner_id", "uuid", (column) => column.notNull().unique())
    .addColumn("display_name", "varchar(120)", (column) => column.notNull())
    .addColumn("handle", "varchar(120)", (column) => column.notNull())
    .addColumn("headline", "varchar(240)", (column) => column.notNull())
    .addColumn("bio", "text", (column) => column.notNull())
    .addColumn("avatar_url", "text", (column) => column.notNull())
    .addColumn("tags", "jsonb", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("dashboards")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("owner_id", "uuid", (column) => column.notNull())
    .addColumn("profile_id", "uuid", (column) =>
      column.notNull().references("profiles.id").onDelete("restrict")
    )
    .addColumn("slug", "varchar(80)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("dashboards_owner_slug_uq", ["owner_id", "slug"])
    .execute();

  await db.schema.createIndex("dashboards_slug_idx").on("dashboards").column("slug").execute();

  await db.schema.createIndex("dashboards_owner_idx").on("dashboards").column("owner_id").execute();

  await db.schema
    .createTable("dashboard_states")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("dashboard_id", "uuid", (column) =>
      column.notNull().references("dashboards.id").onDelete("cascade")
    )
    .addColumn("state", "varchar(16)", (column) => column.notNull())
    .addColumn("version", "integer", (column) => column.notNull())
    .addColumn("layout", "jsonb", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("dashboard_states_dashboard_state_uq", ["dashboard_id", "state"])
    .addCheckConstraint("dashboard_states_state_ck", sql`state in ('draft', 'published')`)
    .addCheckConstraint("dashboard_states_version_ck", sql`version >= 1`)
    .execute();

  await db.schema
    .createTable("widget_instances")
    .addColumn("row_id", "uuid", (column) => column.primaryKey())
    .addColumn("widget_id", "uuid", (column) => column.notNull())
    .addColumn("dashboard_id", "uuid", (column) =>
      column.notNull().references("dashboards.id").onDelete("cascade")
    )
    .addColumn("state", "varchar(16)", (column) => column.notNull())
    .addColumn("widget_type", "varchar(120)", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull())
    .addColumn("title", "varchar(240)", (column) => column.notNull())
    .addColumn("config", "jsonb", (column) => column.notNull())
    .addColumn("projection_data", "jsonb", (column) => column.notNull())
    .addColumn("stale", "boolean", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) => column.notNull())
    .addColumn("sort_order", "integer", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("widget_instances_state_widget_uq", ["dashboard_id", "state", "widget_id"])
    .addForeignKeyConstraint(
      "widget_instances_dashboard_state_fk",
      ["dashboard_id", "state"],
      "dashboard_states",
      ["dashboard_id", "state"],
      (constraint) => constraint.onDelete("cascade")
    )
    .addCheckConstraint("widget_instances_state_ck", sql`state in ('draft', 'published')`)
    .addCheckConstraint("widget_instances_schema_version_ck", sql`schema_version >= 1`)
    .execute();

  await db.schema
    .createIndex("widget_instances_dashboard_state_order_idx")
    .on("widget_instances")
    .columns(["dashboard_id", "state", "sort_order"])
    .execute();

  await db.schema
    .createIndex("widget_instances_widget_id_idx")
    .on("widget_instances")
    .column("widget_id")
    .execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db.schema.dropTable("widget_instances").execute();
  await db.schema.dropTable("dashboard_states").execute();
  await db.schema.dropTable("dashboards").execute();
  await db.schema.dropTable("profiles").execute();
}
