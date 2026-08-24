import { createHash, randomUUID } from "node:crypto";

import { sql } from "kysely";

const providerValues = "'fixture', 'netease', 'github', 'bangumi', 'steam', 'bilibili'";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await createAuthTables(db);
  await createCredentialTable(db);
  await alterRuntimeTables(db);
  await splitWidgetConfiguration(db);
  await rekeyProjections(db, "up");
  await upgradeCurrentNeteaseRevisions(db);
  await createNeteaseNativeTables(db);
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await assertNoPostUpgradeRevisions(db);
  await restorePreUpgradePointers(db);
  await sql`set constraints all immediate`.execute(db);
  await dropNeteaseNativeTables(db);
  await db.schema.alterTable("dashboard_revision_widgets").addColumn("config", "jsonb").execute();
  await sql`alter table dashboard_revision_widgets disable trigger dashboard_revision_widgets_immutable_update`.execute(
    db
  );
  await sql`
    update dashboard_revision_widgets
    set config = data_config || presentation_config
  `.execute(db);
  await sql`alter table dashboard_revision_widgets enable trigger dashboard_revision_widgets_immutable_update`.execute(
    db
  );
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .alterColumn("config", (column) => column.setNotNull())
    .execute();
  await rekeyProjections(db, "down");
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .dropConstraint("dashboard_revision_widgets_provider_ck")
    .execute();
  await db.schema.alterTable("dashboard_revision_widgets").dropColumn("provider").execute();
  await db.schema.alterTable("dashboard_revision_widgets").dropColumn("data_config").execute();
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .dropColumn("presentation_config")
    .execute();

  await db.schema
    .alterTable("dashboard_revisions")
    .dropConstraint("dashboard_revisions_operation_ck")
    .execute();
  await db.schema
    .alterTable("dashboard_revisions")
    .addCheckConstraint(
      "dashboard_revisions_operation_ck",
      sql`operation in (
        'initial_migration', 'seed', 'save', 'widget_add', 'widget_update',
        'widget_delete', 'restore'
      )`
    )
    .execute();

  await db.schema
    .alterTable("provider_sync_states")
    .dropConstraint("provider_sync_states_status_ck")
    .execute();
  await db.schema
    .alterTable("provider_sync_states")
    .addCheckConstraint(
      "provider_sync_states_status_ck",
      sql`status in ('idle', 'queued', 'running', 'retry_wait', 'completed', 'failed')`
    )
    .execute();

  await db.schema
    .alterTable("provider_raw_snapshots")
    .dropConstraint("provider_raw_snapshots_run_source_hash_uq")
    .execute();
  await db.schema
    .alterTable("provider_raw_snapshots")
    .addUniqueConstraint("provider_raw_snapshots_run_hash_uq", ["sync_run_id", "payload_hash"])
    .execute();
  await db.schema.alterTable("provider_raw_snapshots").dropColumn("source_kind").execute();

  await db.schema.dropTable("provider_credentials").execute();
  await db.schema.dropTable("auth_oauth_states").execute();
  await db.schema.dropTable("auth_sessions").execute();
  await db.schema.dropTable("auth_identities").execute();
  await db.schema.dropTable("actors").execute();
}

async function createAuthTables(db) {
  await db.schema
    .createTable("actors")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("role", "varchar(16)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addCheckConstraint("actors_role_ck", sql`role in ('owner', 'viewer')`)
    .execute();

  await db.schema
    .createTable("auth_identities")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("actor_id", "uuid", (column) =>
      column.notNull().references("actors.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("provider_subject", "varchar(160)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("auth_identities_provider_subject_uq", ["provider", "provider_subject"])
    .addCheckConstraint("auth_identities_provider_ck", sql`provider = 'github'`)
    .execute();

  await db.schema
    .createTable("auth_sessions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("actor_id", "uuid", (column) =>
      column.notNull().references("actors.id").onDelete("cascade")
    )
    .addColumn("token_hash", "char(64)", (column) => column.notNull().unique())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addCheckConstraint("auth_sessions_token_hash_ck", sql`token_hash ~ '^[0-9a-f]{64}$'`)
    .execute();
  await db.schema
    .createIndex("auth_sessions_actor_expires_idx")
    .on("auth_sessions")
    .columns(["actor_id", "expires_at"])
    .execute();

  await db.schema
    .createTable("auth_oauth_states")
    .addColumn("state_hash", "char(64)", (column) => column.primaryKey())
    .addColumn("code_verifier_ciphertext", "bytea", (column) => column.notNull())
    .addColumn("code_verifier_nonce", "bytea", (column) => column.notNull())
    .addColumn("code_verifier_auth_tag", "bytea", (column) => column.notNull())
    .addColumn("encryption_version", "integer", (column) => column.notNull())
    .addColumn("key_id", "varchar(120)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addCheckConstraint("auth_oauth_states_hash_ck", sql`state_hash ~ '^[0-9a-f]{64}$'`)
    .addCheckConstraint("auth_oauth_states_version_ck", sql`encryption_version >= 1`)
    .execute();
  await db.schema
    .createIndex("auth_oauth_states_expires_idx")
    .on("auth_oauth_states")
    .column("expires_at")
    .execute();
}

async function createCredentialTable(db) {
  await db.schema
    .createTable("provider_credentials")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("credential_type", "varchar(64)", (column) => column.notNull())
    .addColumn("ciphertext", "bytea", (column) => column.notNull())
    .addColumn("nonce", "bytea", (column) => column.notNull())
    .addColumn("auth_tag", "bytea", (column) => column.notNull())
    .addColumn("encryption_version", "integer", (column) => column.notNull())
    .addColumn("key_id", "varchar(120)", (column) => column.notNull())
    .addColumn("status", "varchar(32)", (column) => column.notNull())
    .addColumn("validated_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("provider_credentials_connection_type_uq", [
      "provider_connection_id",
      "credential_type"
    ])
    .addCheckConstraint("provider_credentials_type_ck", sql`credential_type = 'music_u'`)
    .addCheckConstraint(
      "provider_credentials_status_ck",
      sql`status in ('pending_validation', 'valid', 'expired', 'invalid', 'revoked')`
    )
    .addCheckConstraint("provider_credentials_version_ck", sql`encryption_version >= 1`)
    .addCheckConstraint("provider_credentials_nonce_ck", sql`octet_length(nonce) = 12`)
    .addCheckConstraint("provider_credentials_auth_tag_ck", sql`octet_length(auth_tag) = 16`)
    .execute();
}

async function alterRuntimeTables(db) {
  await db.schema
    .alterTable("provider_sync_states")
    .dropConstraint("provider_sync_states_status_ck")
    .execute();
  await db.schema
    .alterTable("provider_sync_states")
    .addCheckConstraint(
      "provider_sync_states_status_ck",
      sql`status in (
        'idle', 'queued', 'running', 'retry_wait', 'completed', 'failed', 'credential_invalid'
      )`
    )
    .execute();

  await db.schema
    .alterTable("provider_raw_snapshots")
    .dropConstraint("provider_raw_snapshots_run_hash_uq")
    .execute();
  await db.schema
    .alterTable("provider_raw_snapshots")
    .addColumn("source_kind", "varchar(160)")
    .execute();
  await sql`
    update provider_raw_snapshots
    set source_kind = case
      when provider = 'fixture' then 'fixture.dashboard'
      else provider || '.legacy'
    end
  `.execute(db);
  await db.schema
    .alterTable("provider_raw_snapshots")
    .alterColumn("source_kind", (column) => column.setNotNull())
    .execute();
  await db.schema
    .alterTable("provider_raw_snapshots")
    .addUniqueConstraint("provider_raw_snapshots_run_source_hash_uq", [
      "sync_run_id",
      "source_kind",
      "payload_hash"
    ])
    .execute();
  await db.schema
    .alterTable("provider_raw_snapshots")
    .addCheckConstraint(
      "provider_raw_snapshots_source_kind_ck",
      sql`source_kind ~ '^[a-z][a-z0-9_.-]{2,159}$'`
    )
    .execute();
}

async function splitWidgetConfiguration(db) {
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .addColumn("provider", "varchar(32)")
    .addColumn("data_config", "jsonb")
    .addColumn("presentation_config", "jsonb")
    .execute();
  await sql`alter table dashboard_revision_widgets disable trigger dashboard_revision_widgets_immutable_update`.execute(
    db
  );
  await sql`
    update dashboard_revision_widgets
    set
      provider = 'fixture',
      data_config = case
        when widget_type = 'music.netease.overview'
          then jsonb_build_object('range', coalesce(config->'range', '"7d"'::jsonb))
        else config
      end,
      presentation_config = case
        when widget_type = 'music.netease.overview'
          then config - 'range'
        else '{}'::jsonb
      end
  `.execute(db);
  await sql`alter table dashboard_revision_widgets enable trigger dashboard_revision_widgets_immutable_update`.execute(
    db
  );
  for (const column of ["provider", "data_config", "presentation_config"]) {
    await db.schema
      .alterTable("dashboard_revision_widgets")
      .alterColumn(column, (builder) => builder.setNotNull())
      .execute();
  }
  await db.schema
    .alterTable("dashboard_revision_widgets")
    .addCheckConstraint(
      "dashboard_revision_widgets_provider_ck",
      sql.raw(`provider in (${providerValues})`)
    )
    .execute();
  await db.schema.alterTable("dashboard_revision_widgets").dropColumn("config").execute();

  await db.schema
    .alterTable("dashboard_revisions")
    .dropConstraint("dashboard_revisions_operation_ck")
    .execute();
  await db.schema
    .alterTable("dashboard_revisions")
    .addCheckConstraint(
      "dashboard_revisions_operation_ck",
      sql`operation in (
        'initial_migration', 'seed', 'save', 'widget_add', 'widget_update',
        'widget_delete', 'restore', 'schema_upgrade'
      )`
    )
    .execute();
}

async function rekeyProjections(db, direction) {
  const snapshots = await db
    .selectFrom("dashboard_revision_widgets")
    .select(["widget_id", "widget_type", "schema_version", "data_config", "presentation_config"])
    .execute();
  const projections = await db
    .selectFrom("widget_projections")
    .selectAll()
    .orderBy("generated_at", "asc")
    .execute();
  const latest = new Map();
  for (const projection of projections) {
    const candidates = snapshots.filter((snapshot) => snapshot.widget_id === projection.widget_id);
    for (const snapshot of candidates) {
      const merged = {
        ...(snapshot.data_config ?? {}),
        ...(snapshot.presentation_config ?? {})
      };
      const oldKey = hashCanonical({
        config: merged,
        schemaVersion: snapshot.schema_version,
        type: snapshot.widget_type
      });
      const newKey = hashCanonical({
        dataConfig: snapshot.data_config ?? merged,
        schemaVersion: snapshot.schema_version,
        type: snapshot.widget_type
      });
      const sourceKey = direction === "up" ? oldKey : newKey;
      const targetKey = direction === "up" ? newKey : oldKey;
      if (projection.projection_key.trim() !== sourceKey) continue;
      latest.set(`${projection.widget_id}:${targetKey}`, {
        ...projection,
        projection_key: targetKey
      });
    }
  }
  if (latest.size > 0) {
    await db
      .insertInto("widget_projections")
      .values(
        [...latest.values()].map((projection) => ({
          ...projection,
          data: JSON.stringify(projection.data)
        }))
      )
      .onConflict((conflict) =>
        conflict.columns(["widget_id", "projection_key"]).doUpdateSet((excluded) => ({
          data: excluded.ref("excluded.data"),
          generated_at: excluded.ref("excluded.generated_at"),
          last_success_at: excluded.ref("excluded.last_success_at"),
          projection_schema_version: excluded.ref("excluded.projection_schema_version"),
          projection_version_id: excluded.ref("excluded.projection_version_id"),
          provider: excluded.ref("excluded.provider"),
          provider_connection_id: excluded.ref("excluded.provider_connection_id"),
          source_snapshot_id: excluded.ref("excluded.source_snapshot_id"),
          stale: excluded.ref("excluded.stale")
        }))
      )
      .execute();
  }
  const keep = new Set([...latest.keys()]);
  for (const projection of projections) {
    const key = `${projection.widget_id}:${projection.projection_key.trim()}`;
    if (keep.has(key)) continue;
    const wasMapped = [...latest.values()].some(
      (candidate) =>
        candidate.widget_id === projection.widget_id &&
        candidate.projection_key !== projection.projection_key.trim()
    );
    if (wasMapped) {
      await db
        .deleteFrom("widget_projections")
        .where("widget_id", "=", projection.widget_id)
        .where("projection_key", "=", projection.projection_key.trim())
        .execute();
    }
  }
}

async function upgradeCurrentNeteaseRevisions(db) {
  const dashboards = await db.selectFrom("dashboards").selectAll().execute();
  for (const dashboard of dashboards) {
    let nextRevisionNumber = dashboard.next_revision_number;
    if (dashboard.current_draft_revision_id === dashboard.current_published_revision_id) {
      const upgraded = await cloneRevision(
        db,
        dashboard,
        dashboard.current_draft_revision_id,
        nextRevisionNumber
      );
      if (upgraded) {
        nextRevisionNumber += 1;
        await db
          .updateTable("dashboards")
          .set({
            current_draft_revision_id: upgraded,
            current_published_revision_id: upgraded,
            next_revision_number: nextRevisionNumber,
            updated_at: new Date()
          })
          .where("id", "=", dashboard.id)
          .execute();
      }
      continue;
    }
    const published = await cloneRevision(
      db,
      dashboard,
      dashboard.current_published_revision_id,
      nextRevisionNumber
    );
    if (published) nextRevisionNumber += 1;
    const draft = await cloneRevision(
      db,
      dashboard,
      dashboard.current_draft_revision_id,
      nextRevisionNumber
    );
    if (draft) nextRevisionNumber += 1;
    if (published || draft) {
      await db
        .updateTable("dashboards")
        .set({
          current_draft_revision_id: draft ?? dashboard.current_draft_revision_id,
          current_published_revision_id: published ?? dashboard.current_published_revision_id,
          next_revision_number: nextRevisionNumber,
          updated_at: new Date()
        })
        .where("id", "=", dashboard.id)
        .execute();
    }
  }
}

async function cloneRevision(db, dashboard, revisionId, revisionNumber) {
  const rows = await db
    .selectFrom("dashboard_revision_widgets")
    .selectAll()
    .where("revision_id", "=", revisionId)
    .orderBy("sort_order", "asc")
    .execute();
  if (
    !rows.some((row) => row.widget_type === "music.netease.overview" && row.schema_version === 1)
  ) {
    return null;
  }
  const source = await db
    .selectFrom("dashboard_revisions")
    .selectAll()
    .where("id", "=", revisionId)
    .executeTakeFirstOrThrow();
  const id = randomUUID();
  const createdAt = new Date();
  await db
    .insertInto("dashboard_revisions")
    .values({
      created_at: createdAt,
      created_by: null,
      dashboard_id: dashboard.id,
      id,
      layout: JSON.stringify(source.layout),
      operation: "schema_upgrade",
      parent_revision_id: revisionId,
      restored_from_revision_id: null,
      revision_number: revisionNumber
    })
    .execute();
  await db
    .insertInto("dashboard_revision_widgets")
    .values(
      rows.map((row) => ({
        dashboard_id: row.dashboard_id,
        data_config: JSON.stringify(row.data_config),
        enabled: row.enabled,
        presentation_config: JSON.stringify(row.presentation_config),
        provider:
          row.widget_type === "music.netease.overview" && row.schema_version === 1
            ? "netease"
            : row.provider,
        revision_id: id,
        schema_version:
          row.widget_type === "music.netease.overview" && row.schema_version === 1
            ? 2
            : row.schema_version,
        sort_order: row.sort_order,
        title: row.title,
        widget_id: row.widget_id,
        widget_type: row.widget_type
      }))
    )
    .execute();
  return id;
}

async function createNeteaseNativeTables(db) {
  await db.schema
    .createTable("netease_accounts")
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.primaryKey().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider_user_id", "varchar(120)", (column) => column.notNull())
    .addColumn("display_name", "varchar(240)")
    .addColumn("last_validated_at", "timestamptz", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("netease_accounts_connection_user_uq", [
      "provider_connection_id",
      "provider_user_id"
    ])
    .execute();

  await db.schema
    .createTable("netease_tracks")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider_track_id", "varchar(120)", (column) => column.notNull())
    .addColumn("name", "varchar(500)", (column) => column.notNull())
    .addColumn("duration_ms", "integer")
    .addColumn("album_provider_id", "varchar(120)")
    .addColumn("album_name", "varchar(500)")
    .addColumn("cover_url", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("netease_tracks_connection_provider_id_uq", [
      "provider_connection_id",
      "provider_track_id"
    ])
    .addCheckConstraint("netease_tracks_duration_ck", sql`duration_ms is null or duration_ms >= 0`)
    .execute();

  await db.schema
    .createTable("netease_artists")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("provider_artist_id", "varchar(120)", (column) => column.notNull())
    .addColumn("name", "varchar(500)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("netease_artists_connection_provider_id_uq", [
      "provider_connection_id",
      "provider_artist_id"
    ])
    .execute();

  await db.schema
    .createTable("netease_track_artists")
    .addColumn("track_id", "uuid", (column) =>
      column.notNull().references("netease_tracks.id").onDelete("cascade")
    )
    .addColumn("artist_id", "uuid", (column) =>
      column.notNull().references("netease_artists.id").onDelete("cascade")
    )
    .addColumn("position", "integer", (column) => column.notNull())
    .addPrimaryKeyConstraint("netease_track_artists_pk", ["track_id", "artist_id"])
    .addUniqueConstraint("netease_track_artists_position_uq", ["track_id", "position"])
    .addCheckConstraint("netease_track_artists_position_ck", sql`position >= 0`)
    .execute();

  await db.schema
    .createTable("netease_recent_listens")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("track_id", "uuid", (column) =>
      column.notNull().references("netease_tracks.id").onDelete("cascade")
    )
    .addColumn("provider_played_at", "timestamptz", (column) => column.notNull())
    .addColumn("source_snapshot_id", "uuid", (column) =>
      column.notNull().references("provider_raw_snapshots.id").onDelete("restrict")
    )
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("netease_recent_listens_identity_uq", [
      "provider_connection_id",
      "track_id",
      "provider_played_at"
    ])
    .execute();
  await db.schema
    .createIndex("netease_recent_listens_connection_time_idx")
    .on("netease_recent_listens")
    .columns(["provider_connection_id", "provider_played_at"])
    .execute();

  await db.schema
    .createTable("netease_track_play_snapshots")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("track_id", "uuid", (column) =>
      column.notNull().references("netease_tracks.id").onDelete("cascade")
    )
    .addColumn("period", "varchar(32)", (column) => column.notNull())
    .addColumn("play_count", "integer", (column) => column.notNull())
    .addColumn("score", "numeric")
    .addColumn("source_snapshot_id", "uuid", (column) =>
      column.notNull().references("provider_raw_snapshots.id").onDelete("restrict")
    )
    .addColumn("observed_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("netease_track_play_snapshots_source_track_uq", [
      "source_snapshot_id",
      "track_id",
      "period"
    ])
    .addCheckConstraint(
      "netease_track_play_snapshots_period_ck",
      sql`period in ('week', 'all_time')`
    )
    .addCheckConstraint("netease_track_play_snapshots_count_ck", sql`play_count >= 0`)
    .execute();

  await db.schema
    .createTable("netease_metric_snapshots")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider_connection_id", "uuid", (column) =>
      column.notNull().references("provider_connections.id").onDelete("cascade")
    )
    .addColumn("metric", "varchar(64)", (column) => column.notNull())
    .addColumn("value", "numeric", (column) => column.notNull())
    .addColumn("unit", "varchar(24)", (column) => column.notNull())
    .addColumn("period", "varchar(32)", (column) => column.notNull())
    .addColumn("provenance", "varchar(32)", (column) => column.notNull())
    .addColumn("source_snapshot_id", "uuid", (column) =>
      column.notNull().references("provider_raw_snapshots.id").onDelete("restrict")
    )
    .addColumn("observed_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("netease_metric_snapshots_source_metric_uq", [
      "source_snapshot_id",
      "metric",
      "period"
    ])
    .addCheckConstraint(
      "netease_metric_snapshots_metric_ck",
      sql`metric in ('total_listen_count', 'listening_duration')`
    )
    .addCheckConstraint("netease_metric_snapshots_unit_ck", sql`unit in ('plays', 'minutes')`)
    .addCheckConstraint(
      "netease_metric_snapshots_provenance_ck",
      sql`provenance in ('provider_reported', 'nivalis_derived')`
    )
    .addCheckConstraint("netease_metric_snapshots_value_ck", sql`value >= 0`)
    .execute();
}

async function dropNeteaseNativeTables(db) {
  await db.schema.dropTable("netease_metric_snapshots").execute();
  await db.schema.dropTable("netease_track_play_snapshots").execute();
  await db.schema.dropTable("netease_recent_listens").execute();
  await db.schema.dropTable("netease_track_artists").execute();
  await db.schema.dropTable("netease_artists").execute();
  await db.schema.dropTable("netease_tracks").execute();
  await db.schema.dropTable("netease_accounts").execute();
}

async function assertNoPostUpgradeRevisions(db) {
  const result = await sql`
    select count(*)::integer as count
    from dashboard_revisions revision
    where revision.operation <> 'schema_upgrade'
      and exists (
        select 1
        from dashboard_revisions upgrade
        where upgrade.operation = 'schema_upgrade'
          and upgrade.dashboard_id = revision.dashboard_id
          and revision.revision_number > upgrade.revision_number
      )
  `.execute(db);
  if (Number(result.rows[0]?.count ?? 0) > 0) {
    throw new Error("Migration 004 down requires no Dashboard writes after schema upgrade.");
  }
}

async function restorePreUpgradePointers(db) {
  const dashboards = await db.selectFrom("dashboards").selectAll().execute();
  for (const dashboard of dashboards) {
    const draft = await parentIfUpgrade(db, dashboard.current_draft_revision_id);
    const published = await parentIfUpgrade(db, dashboard.current_published_revision_id);
    await db
      .updateTable("dashboards")
      .set({
        current_draft_revision_id: draft,
        current_published_revision_id: published,
        updated_at: new Date()
      })
      .where("id", "=", dashboard.id)
      .execute();
  }
  await db.deleteFrom("dashboard_revisions").where("operation", "=", "schema_upgrade").execute();
  await sql`
    update dashboards dashboard
    set next_revision_number = (
      select coalesce(max(revision_number), 0) + 1
      from dashboard_revisions revision
      where revision.dashboard_id = dashboard.id
    )
  `.execute(db);
}

async function parentIfUpgrade(db, revisionId) {
  const revision = await db
    .selectFrom("dashboard_revisions")
    .select(["operation", "parent_revision_id"])
    .where("id", "=", revisionId)
    .executeTakeFirstOrThrow();
  return revision.operation === "schema_upgrade" && revision.parent_revision_id
    ? revision.parent_revision_id
    : revisionId;
}

function hashCanonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
