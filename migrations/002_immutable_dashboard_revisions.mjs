import { sql } from "kysely";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .createTable("widgets")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("dashboard_id", "uuid", (column) =>
      column.notNull().references("dashboards.id").onDelete("cascade")
    )
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("widgets_dashboard_id_id_uq", ["dashboard_id", "id"])
    .execute();

  await db.schema
    .createTable("dashboard_revisions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("dashboard_id", "uuid", (column) =>
      column.notNull().references("dashboards.id").onDelete("cascade")
    )
    .addColumn("revision_number", "integer", (column) => column.notNull())
    .addColumn("parent_revision_id", "uuid")
    .addColumn("restored_from_revision_id", "uuid")
    .addColumn("layout", "jsonb", (column) => column.notNull())
    .addColumn("operation", "varchar(32)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("created_by", "uuid")
    .addUniqueConstraint("dashboard_revisions_dashboard_id_id_uq", ["dashboard_id", "id"])
    .addUniqueConstraint("dashboard_revisions_dashboard_number_uq", [
      "dashboard_id",
      "revision_number"
    ])
    .addForeignKeyConstraint(
      "dashboard_revisions_parent_fk",
      ["dashboard_id", "parent_revision_id"],
      "dashboard_revisions",
      ["dashboard_id", "id"],
      (constraint) => constraint.onDelete("no action").deferrable().initiallyDeferred()
    )
    .addForeignKeyConstraint(
      "dashboard_revisions_restored_from_fk",
      ["dashboard_id", "restored_from_revision_id"],
      "dashboard_revisions",
      ["dashboard_id", "id"],
      (constraint) => constraint.onDelete("no action").deferrable().initiallyDeferred()
    )
    .addCheckConstraint("dashboard_revisions_number_ck", sql`revision_number >= 1`)
    .addCheckConstraint(
      "dashboard_revisions_operation_ck",
      sql`operation in (
        'initial_migration',
        'seed',
        'save',
        'widget_add',
        'widget_update',
        'widget_delete',
        'restore'
      )`
    )
    .execute();

  await db.schema
    .createTable("dashboard_revision_widgets")
    .addColumn("dashboard_id", "uuid", (column) => column.notNull())
    .addColumn("revision_id", "uuid", (column) => column.notNull())
    .addColumn("widget_id", "uuid", (column) => column.notNull())
    .addColumn("widget_type", "varchar(120)", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull())
    .addColumn("title", "varchar(240)", (column) => column.notNull())
    .addColumn("config", "jsonb", (column) => column.notNull())
    .addColumn("projection_data", "jsonb", (column) => column.notNull())
    .addColumn("stale", "boolean", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) => column.notNull())
    .addColumn("sort_order", "integer", (column) => column.notNull())
    .addColumn("widget_updated_at", "timestamptz", (column) => column.notNull())
    .addPrimaryKeyConstraint("dashboard_revision_widgets_pk", ["revision_id", "widget_id"])
    .addUniqueConstraint("dashboard_revision_widgets_order_uq", ["revision_id", "sort_order"])
    .addForeignKeyConstraint(
      "dashboard_revision_widgets_revision_fk",
      ["dashboard_id", "revision_id"],
      "dashboard_revisions",
      ["dashboard_id", "id"],
      (constraint) => constraint.onDelete("cascade")
    )
    .addForeignKeyConstraint(
      "dashboard_revision_widgets_widget_fk",
      ["dashboard_id", "widget_id"],
      "widgets",
      ["dashboard_id", "id"],
      (constraint) => constraint.onDelete("no action").deferrable().initiallyDeferred()
    )
    .addCheckConstraint("dashboard_revision_widgets_schema_version_ck", sql`schema_version >= 1`)
    .addCheckConstraint("dashboard_revision_widgets_sort_order_ck", sql`sort_order >= 0`)
    .execute();

  await db.schema
    .createIndex("dashboard_revision_widgets_revision_order_idx")
    .on("dashboard_revision_widgets")
    .columns(["revision_id", "sort_order"])
    .execute();

  await db.schema.alterTable("dashboards").addColumn("current_draft_revision_id", "uuid").execute();
  await db.schema
    .alterTable("dashboards")
    .addColumn("current_published_revision_id", "uuid")
    .execute();
  await db.schema.alterTable("dashboards").addColumn("next_revision_number", "integer").execute();

  await sql`
    do $$
    begin
      if exists (
        select 1
        from dashboards d
        left join dashboard_states s on s.dashboard_id = d.id
        group by d.id
        having count(*) filter (where s.state = 'draft') <> 1
            or count(*) filter (where s.state = 'published') <> 1
      ) then
        raise exception 'Phase 3 migration requires exactly one Draft and one Published state per Dashboard';
      end if;
    end
    $$
  `.execute(db);

  await sql`
    insert into widgets (id, dashboard_id, created_at)
    select widget_id, dashboard_id, min(updated_at)
    from widget_instances
    group by widget_id, dashboard_id
  `.execute(db);

  await sql`
    insert into dashboard_revisions (
      id,
      dashboard_id,
      revision_number,
      parent_revision_id,
      restored_from_revision_id,
      layout,
      operation,
      created_at,
      created_by
    )
    select
      state.id,
      state.dashboard_id,
      case state.state when 'published' then 1 else 2 end,
      case state.state when 'draft' then published.id else null end,
      null,
      state.layout,
      'initial_migration',
      state.updated_at,
      null
    from dashboard_states state
    left join dashboard_states published
      on published.dashboard_id = state.dashboard_id
     and published.state = 'published'
  `.execute(db);

  await sql`
    insert into dashboard_revision_widgets (
      dashboard_id,
      revision_id,
      widget_id,
      widget_type,
      schema_version,
      title,
      config,
      projection_data,
      stale,
      enabled,
      sort_order,
      widget_updated_at
    )
    select
      widget.dashboard_id,
      state.id,
      widget.widget_id,
      widget.widget_type,
      widget.schema_version,
      widget.title,
      widget.config,
      widget.projection_data,
      widget.stale,
      widget.enabled,
      widget.sort_order,
      widget.updated_at
    from widget_instances widget
    inner join dashboard_states state
      on state.dashboard_id = widget.dashboard_id
     and state.state = widget.state
  `.execute(db);

  await sql`
    update dashboards dashboard
    set
      current_draft_revision_id = draft.id,
      current_published_revision_id = published.id,
      next_revision_number = 3,
      updated_at = greatest(dashboard.updated_at, draft.updated_at, published.updated_at)
    from dashboard_states draft, dashboard_states published
    where draft.dashboard_id = dashboard.id
      and draft.state = 'draft'
      and published.dashboard_id = dashboard.id
      and published.state = 'published'
  `.execute(db);

  await sql`
    do $$
    declare
      mutable_state_count bigint;
      revision_count bigint;
      mutable_widget_count bigint;
      revision_widget_count bigint;
    begin
      select count(*) into mutable_state_count from dashboard_states;
      select count(*) into revision_count from dashboard_revisions;
      select count(*) into mutable_widget_count from widget_instances;
      select count(*) into revision_widget_count from dashboard_revision_widgets;

      if mutable_state_count <> revision_count then
        raise exception 'Dashboard revision backfill count mismatch';
      end if;
      if mutable_widget_count <> revision_widget_count then
        raise exception 'Dashboard revision Widget backfill count mismatch';
      end if;
      if exists (
        select 1 from dashboards
        where current_draft_revision_id is null
           or current_published_revision_id is null
           or next_revision_number is null
      ) then
        raise exception 'Dashboard revision pointers were not completely backfilled';
      end if;
    end
    $$
  `.execute(db);

  await db.schema
    .alterTable("dashboards")
    .addForeignKeyConstraint(
      "dashboards_current_draft_revision_fk",
      ["id", "current_draft_revision_id"],
      "dashboard_revisions",
      ["dashboard_id", "id"],
      (constraint) => constraint.onDelete("no action").deferrable().initiallyDeferred()
    )
    .execute();
  await db.schema
    .alterTable("dashboards")
    .addForeignKeyConstraint(
      "dashboards_current_published_revision_fk",
      ["id", "current_published_revision_id"],
      "dashboard_revisions",
      ["dashboard_id", "id"],
      (constraint) => constraint.onDelete("no action").deferrable().initiallyDeferred()
    )
    .execute();
  await db.schema
    .alterTable("dashboards")
    .addCheckConstraint("dashboards_next_revision_number_ck", sql`next_revision_number >= 1`)
    .execute();
  await db.schema
    .alterTable("dashboards")
    .alterColumn("current_draft_revision_id", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("dashboards")
    .alterColumn("current_published_revision_id", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("dashboards")
    .alterColumn("next_revision_number", (column) => column.setNotNull())
    .execute();

  await sql`
    create function nivalis_reject_revision_update()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'Dashboard revisions are immutable' using errcode = '55000';
    end
    $$
  `.execute(db);

  await sql`
    create trigger dashboard_revisions_immutable_update
    before update on dashboard_revisions
    for each row execute function nivalis_reject_revision_update()
  `.execute(db);
  await sql`
    create trigger dashboard_revision_widgets_immutable_update
    before update on dashboard_revision_widgets
    for each row execute function nivalis_reject_revision_update()
  `.execute(db);

  await db.schema.dropTable("widget_instances").execute();
  await db.schema.dropTable("dashboard_states").execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
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

  await sql`
    insert into dashboard_states (id, dashboard_id, state, version, layout, updated_at)
    select
      md5(dashboard.id::text || ':draft')::uuid,
      dashboard.id,
      'draft',
      revision.revision_number,
      revision.layout,
      revision.created_at
    from dashboards dashboard
    inner join dashboard_revisions revision
      on revision.id = dashboard.current_draft_revision_id
    union all
    select
      md5(dashboard.id::text || ':published')::uuid,
      dashboard.id,
      'published',
      revision.revision_number,
      revision.layout,
      revision.created_at
    from dashboards dashboard
    inner join dashboard_revisions revision
      on revision.id = dashboard.current_published_revision_id
  `.execute(db);

  await sql`
    with current_revisions as (
      select
        dashboard.id as dashboard_id,
        dashboard.current_draft_revision_id as revision_id,
        'draft'::varchar as state
      from dashboards dashboard
      union all
      select
        dashboard.id,
        dashboard.current_published_revision_id,
        'published'::varchar
      from dashboards dashboard
    )
    insert into widget_instances (
      row_id,
      widget_id,
      dashboard_id,
      state,
      widget_type,
      schema_version,
      title,
      config,
      projection_data,
      stale,
      enabled,
      sort_order,
      updated_at
    )
    select
      md5(current.revision_id::text || ':' || snapshot.widget_id::text || ':' || current.state)::uuid,
      snapshot.widget_id,
      current.dashboard_id,
      current.state,
      snapshot.widget_type,
      snapshot.schema_version,
      snapshot.title,
      snapshot.config,
      snapshot.projection_data,
      snapshot.stale,
      snapshot.enabled,
      snapshot.sort_order,
      snapshot.widget_updated_at
    from current_revisions current
    inner join dashboard_revision_widgets snapshot
      on snapshot.revision_id = current.revision_id
  `.execute(db);

  await db.schema
    .alterTable("dashboards")
    .dropConstraint("dashboards_current_draft_revision_fk")
    .execute();
  await db.schema
    .alterTable("dashboards")
    .dropConstraint("dashboards_current_published_revision_fk")
    .execute();
  await db.schema
    .alterTable("dashboards")
    .dropConstraint("dashboards_next_revision_number_ck")
    .execute();
  await db.schema.alterTable("dashboards").dropColumn("current_draft_revision_id").execute();
  await db.schema.alterTable("dashboards").dropColumn("current_published_revision_id").execute();
  await db.schema.alterTable("dashboards").dropColumn("next_revision_number").execute();

  await db.schema.dropTable("dashboard_revision_widgets").execute();
  await db.schema.dropTable("widgets").execute();
  await db.schema.dropTable("dashboard_revisions").execute();
  await sql`drop function nivalis_reject_revision_update()`.execute(db);
}
