import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type PhaseTwoDatabase, seedPhaseTwoSchemaFixture } from "../../testing/phase-two-schema";
import {
  createTemporaryMigrationDatabase,
  type TemporaryDatabase
} from "../../testing/temporary-database";
import { createDatabase, type NivalisDatabase } from "./database";
import { createMigrator } from "./migrator";

const rankingId = "00000000-0000-4000-8000-000000009701";
const showcaseId = "00000000-0000-4000-8000-000000009702";

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

describe("NetEase showcase and ranking semantic migration", () => {
  it("creates immutable v2 successors and restores v1 pointers on migration down", async () => {
    const migrator = createMigrator(database);
    const phaseTwo = await migrator.migrateTo("001_current_dashboard_state");
    if (phaseTwo.error) throw phaseTwo.error;
    await seedPhaseTwoSchemaFixture(database as unknown as Kysely<PhaseTwoDatabase>);
    const phaseFive = await migrator.migrateTo("006_netease_data_catalog");
    if (phaseFive.error) throw phaseFive.error;

    const dashboard = await database
      .selectFrom("dashboards")
      .selectAll()
      .where("slug", "=", "about")
      .executeTakeFirstOrThrow();
    const now = new Date();
    await database
      .insertInto("widgets")
      .values([
        { created_at: now, dashboard_id: dashboard.id, id: rankingId },
        { created_at: now, dashboard_id: dashboard.id, id: showcaseId }
      ])
      .execute();
    const revisionIds = new Set([
      dashboard.current_draft_revision_id,
      dashboard.current_published_revision_id
    ]);
    for (const revisionId of revisionIds) {
      await database
        .insertInto("dashboard_revision_widgets")
        .values([
          {
            dashboard_id: dashboard.id,
            data_config: JSON.stringify({ publicLimit: 10, range: "week" }),
            enabled: true,
            presentation_config: JSON.stringify({}),
            provider: "netease",
            revision_id: revisionId,
            schema_version: 1,
            sort_order: 100,
            title: "网易云 · 听歌排行",
            widget_id: rankingId,
            widget_type: "music.netease.ranking"
          },
          {
            dashboard_id: dashboard.id,
            data_config: JSON.stringify({ source: "all_time_track" }),
            enabled: true,
            presentation_config: JSON.stringify({}),
            provider: "netease",
            revision_id: revisionId,
            schema_version: 1,
            sort_order: 101,
            title: "网易云 · 音乐名片",
            widget_id: showcaseId,
            widget_type: "music.netease.showcase"
          }
        ])
        .execute();
    }

    const before = await database
      .selectFrom("dashboards")
      .select(["current_draft_revision_id", "current_published_revision_id"])
      .where("id", "=", dashboard.id)
      .executeTakeFirstOrThrow();
    const upgraded = await migrator.migrateToLatest();
    if (upgraded.error) throw upgraded.error;
    const after = await database
      .selectFrom("dashboards")
      .select(["current_draft_revision_id", "current_published_revision_id"])
      .where("id", "=", dashboard.id)
      .executeTakeFirstOrThrow();
    expect(after).not.toEqual(before);

    for (const revisionId of new Set([
      after.current_draft_revision_id,
      after.current_published_revision_id
    ])) {
      const widgets = await database
        .selectFrom("dashboard_revision_widgets")
        .select(["widget_type", "schema_version", "data_config", "presentation_config"])
        .where("revision_id", "=", revisionId)
        .where("widget_id", "in", [rankingId, showcaseId])
        .orderBy("widget_type")
        .execute();
      expect(widgets).toMatchObject([
        {
          data_config: { publicLimit: 10, publicRanges: ["week", "all_time"] },
          presentation_config: { rankingStyle: "editorial", showPlayCount: true },
          schema_version: 2,
          widget_type: "music.netease.ranking"
        },
        {
          data_config: { selections: [] },
          presentation_config: { galleryStyle: "editorial", showMeta: true },
          schema_version: 2,
          widget_type: "music.netease.showcase"
        }
      ]);
    }
    const historical = await database
      .selectFrom("dashboard_revision_widgets")
      .select(["widget_type", "schema_version"])
      .where("revision_id", "=", before.current_draft_revision_id)
      .where("widget_id", "in", [rankingId, showcaseId])
      .orderBy("widget_type")
      .execute();
    expect(historical.map((widget) => widget.schema_version)).toEqual([1, 1]);

    const rolledBack = await migrator.migrateDown();
    if (rolledBack.error) throw rolledBack.error;
    const restored = await database
      .selectFrom("dashboards")
      .select(["current_draft_revision_id", "current_published_revision_id"])
      .where("id", "=", dashboard.id)
      .executeTakeFirstOrThrow();
    expect(restored).toEqual(before);
  });
});
