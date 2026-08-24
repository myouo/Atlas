import type {
  DashboardRevisionSnapshot,
  DashboardSnapshot,
  DashboardStateKind,
  JsonValue,
  ResponsiveLayout
} from "@nivalis/domain";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { KyselyDashboardRepository } from "../repositories/kysely-dashboard-repository";
import { KyselyProjectionRepository } from "../repositories/kysely-projection-repository";
import type { PhaseTwoDatabase } from "../../testing/phase-two-schema";
import { seedPhaseTwoSchemaFixture } from "../../testing/phase-two-schema";
import {
  createTemporaryMigrationDatabase,
  type TemporaryDatabase
} from "../../testing/temporary-database";
import { createDatabase, type NivalisDatabase } from "./database";
import { createMigrator } from "./migrator";
import { PHASE_TWO_OWNER_ID } from "./phase-two-fixture";

let temporary: TemporaryDatabase;
let database: NivalisDatabase;

beforeAll(async () => {
  temporary = await createTemporaryMigrationDatabase();
  database = createDatabase({ connectionString: temporary.connectionString, maxConnections: 4 });
});

afterAll(async () => {
  if (database) await database.destroy();
  if (temporary) await temporary.drop();
});

describe("Phase 2 to Phase 5 migration", () => {
  it("preserves immutable v1 history, upgrades current NetEase semantics, and rolls down safely", async () => {
    const migrator = createMigrator(database);
    const phaseTwoMigration = await migrator.migrateTo("001_current_dashboard_state");
    if (phaseTwoMigration.error) throw phaseTwoMigration.error;

    const phaseTwoDatabase = database as unknown as Kysely<PhaseTwoDatabase>;
    await seedPhaseTwoSchemaFixture(phaseTwoDatabase);
    const beforeDraft = await readPhaseTwoSnapshot(phaseTwoDatabase, "draft");
    const beforePublished = await readPhaseTwoSnapshot(phaseTwoDatabase, "published");

    const phaseFour = await migrator.migrateTo("003_projection_sync_runtime");
    if (phaseFour.error) throw phaseFour.error;
    const phaseFourPointers = await database
      .selectFrom("dashboards")
      .select(["current_draft_revision_id", "current_published_revision_id"])
      .where("slug", "=", "about")
      .executeTakeFirstOrThrow();
    const originalDraftId = phaseFourPointers.current_draft_revision_id;
    const originalPublishedId = phaseFourPointers.current_published_revision_id;

    const upgraded = await migrator.migrateToLatest();
    if (upgraded.error) throw upgraded.error;
    const dashboards = new KyselyDashboardRepository(database);
    const projections = new KyselyProjectionRepository(database);
    const [draft, published] = await Promise.all([
      dashboards.getCurrentForOwner(PHASE_TWO_OWNER_ID, "about", "draft"),
      dashboards.getCurrentBySlug("about", "published")
    ]);
    expect(draft).not.toBeNull();
    expect(published).not.toBeNull();
    expect(draft!.revisionId).not.toBe(originalDraftId);
    expect(published!.revisionId).not.toBe(originalPublishedId);
    expect(draft!.widgets.find((widget) => widget.type === "music.netease.overview")).toMatchObject(
      { provider: "netease", schemaVersion: 2 }
    );

    const [historicalDraft, historicalPublished] = await Promise.all([
      dashboards.getRevisionForOwner(PHASE_TWO_OWNER_ID, "about", originalDraftId),
      dashboards.getRevisionForOwner(PHASE_TWO_OWNER_ID, "about", originalPublishedId)
    ]);
    expect(await hydrateSnapshot(historicalDraft!, projections)).toEqual(beforeDraft);
    expect(await hydrateSnapshot(historicalPublished!, projections)).toEqual(beforePublished);

    const history = await dashboards.listRevisionsForOwner(PHASE_TWO_OWNER_ID, "about", {
      limit: 20
    });
    expect(history.items.map((revision) => revision.revisionNumber)).toEqual([4, 3, 2, 1]);
    expect(
      history.items.slice(0, 2).every((revision) => revision.operation === "schema_upgrade")
    ).toBe(true);
    expect(
      history.items.slice(2).every((revision) => revision.operation === "initial_migration")
    ).toBe(true);

    const retired = await sql<{
      readonly mutable_states: string | null;
      readonly mutable_widgets: string | null;
      readonly revision_projection_column: string | null;
    }>`
      select
        to_regclass('dashboard_states')::text as mutable_states,
        to_regclass('widget_instances')::text as mutable_widgets,
        (
          select column_name
          from information_schema.columns
          where table_name = 'dashboard_revision_widgets'
          and column_name = 'projection_data'
        ) as revision_projection_column
    `.execute(database);
    expect(retired.rows[0]).toEqual({
      mutable_states: null,
      mutable_widgets: null,
      revision_projection_column: null
    });

    const phaseFiveExtensionTables = await sql<{
      readonly attempts: string | null;
      readonly catalog: string | null;
    }>`
      select
        to_regclass('provider_auth_attempts')::text as attempts,
        to_regclass('provider_data_catalogs')::text as catalog
    `.execute(database);
    expect(phaseFiveExtensionTables.rows[0]).toEqual({
      attempts: "provider_auth_attempts",
      catalog: "provider_data_catalogs"
    });

    const rolledBackCatalog = await migrator.migrateDown();
    if (rolledBackCatalog.error) throw rolledBackCatalog.error;
    const afterCatalogDown = await sql<{
      readonly attempts: string | null;
      readonly catalog: string | null;
    }>`
      select
        to_regclass('provider_auth_attempts')::text as attempts,
        to_regclass('provider_data_catalogs')::text as catalog
    `.execute(database);
    expect(afterCatalogDown.rows[0]).toEqual({
      attempts: "provider_auth_attempts",
      catalog: null
    });

    const rolledBackAttempts = await migrator.migrateDown();
    if (rolledBackAttempts.error) throw rolledBackAttempts.error;
    const removedAttempts = await sql<{ readonly attempts: string | null }>`
      select to_regclass('provider_auth_attempts')::text as attempts
    `.execute(database);
    expect(removedAttempts.rows[0]?.attempts).toBeNull();

    const rolledBack = await migrator.migrateDown();
    if (rolledBack.error) throw rolledBack.error;
    const restoredConfig = await sql<{ readonly count: string }>`
      select count(*)::text as count
      from dashboard_revision_widgets
      where config is not null
    `.execute(database);
    expect(Number(restoredConfig.rows[0]?.count)).toBeGreaterThan(0);
    const phaseFiveTables = await sql<{
      readonly actors: string | null;
      readonly credentials: string | null;
      readonly native_tracks: string | null;
    }>`
      select
        to_regclass('actors')::text as actors,
        to_regclass('provider_credentials')::text as credentials,
        to_regclass('netease_tracks')::text as native_tracks
    `.execute(database);
    expect(phaseFiveTables.rows[0]).toEqual({
      actors: null,
      credentials: null,
      native_tracks: null
    });

    const rolledBackRuntime = await migrator.migrateDown();
    if (rolledBackRuntime.error) throw rolledBackRuntime.error;
    const restoredProjectionSnapshot = await sql<{ readonly count: string }>`
      select count(*)::text as count
      from dashboard_revision_widgets
      where projection_data is not null
        and stale is not null
        and widget_updated_at is not null
    `.execute(database);
    expect(Number(restoredProjectionSnapshot.rows[0]?.count)).toBeGreaterThan(0);
    const removedRuntime = await sql<{
      readonly projections: string | null;
      readonly sync_runs: string | null;
    }>`
      select
        to_regclass('widget_projections')::text as projections,
        to_regclass('provider_sync_runs')::text as sync_runs
    `.execute(database);
    expect(removedRuntime.rows[0]).toEqual({ projections: null, sync_runs: null });
  });
});

interface NormalizedSnapshot {
  readonly layout: ResponsiveLayout;
  readonly widgets: readonly {
    readonly config: unknown;
    readonly data: JsonValue;
    readonly enabled: boolean;
    readonly id: string;
    readonly schemaVersion: number;
    readonly stale: boolean;
    readonly title: string;
    readonly type: string;
    readonly updatedAt: string;
  }[];
}

async function readPhaseTwoSnapshot(
  connection: Kysely<PhaseTwoDatabase>,
  state: DashboardStateKind
): Promise<NormalizedSnapshot> {
  const current = await connection
    .selectFrom("dashboard_states")
    .select("layout")
    .where("state", "=", state)
    .executeTakeFirstOrThrow();
  const widgets = await connection
    .selectFrom("widget_instances")
    .selectAll()
    .where("state", "=", state)
    .orderBy("sort_order", "asc")
    .execute();
  return {
    layout: current.layout,
    widgets: widgets.map((widget) => ({
      config: widget.config,
      data: widget.projection_data,
      enabled: widget.enabled,
      id: widget.widget_id,
      schemaVersion: widget.schema_version,
      stale: widget.stale,
      title: widget.title,
      type: widget.widget_type,
      updatedAt: widget.updated_at.toISOString()
    }))
  };
}

async function hydrateSnapshot(
  snapshot: DashboardSnapshot | DashboardRevisionSnapshot,
  projections: KyselyProjectionRepository
): Promise<NormalizedSnapshot> {
  const fallbackAt = "updatedAt" in snapshot ? snapshot.updatedAt : snapshot.createdAt;
  const hydrated = await projections.hydrateWidgets(snapshot.widgets, snapshot.profile, fallbackAt);
  return {
    layout: snapshot.layout,
    widgets: hydrated.widgets.map((widget) => ({
      config: { ...widget.dataConfig, ...widget.presentationConfig },
      data: widget.data,
      enabled: widget.enabled,
      id: widget.id,
      schemaVersion: widget.schemaVersion,
      stale: widget.stale,
      title: widget.title,
      type: widget.type,
      updatedAt: widget.updatedAt.toISOString()
    }))
  };
}
