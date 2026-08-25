import { randomUUID } from "node:crypto";

const UPGRADED_TYPES = new Set(["music.netease.ranking", "music.netease.showcase"]);

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  const dashboards = await db.selectFrom("dashboards").selectAll().execute();
  for (const dashboard of dashboards) {
    let nextRevisionNumber = dashboard.next_revision_number;
    const replacements = new Map();
    for (const revisionId of new Set([
      dashboard.current_published_revision_id,
      dashboard.current_draft_revision_id
    ])) {
      const upgraded = await cloneCurrentRevision(db, dashboard, revisionId, nextRevisionNumber);
      if (!upgraded) continue;
      replacements.set(revisionId, upgraded);
      nextRevisionNumber += 1;
    }
    if (replacements.size === 0) continue;
    await db
      .updateTable("dashboards")
      .set({
        current_draft_revision_id:
          replacements.get(dashboard.current_draft_revision_id) ??
          dashboard.current_draft_revision_id,
        current_published_revision_id:
          replacements.get(dashboard.current_published_revision_id) ??
          dashboard.current_published_revision_id,
        next_revision_number: nextRevisionNumber,
        updated_at: new Date()
      })
      .where("id", "=", dashboard.id)
      .execute();
  }
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  const dashboards = await db.selectFrom("dashboards").selectAll().execute();
  const generatedRevisionIds = [];
  for (const dashboard of dashboards) {
    const generated = await generatedUpgrades(db, dashboard.id);
    if (generated.length === 0) continue;
    const generatedIds = new Set(generated.map((revision) => revision.id));
    const child = await db
      .selectFrom("dashboard_revisions")
      .select("id")
      .where("parent_revision_id", "in", [...generatedIds])
      .executeTakeFirst();
    if (child) {
      throw new Error(
        "Cannot roll back NetEase Widget semantics after later Dashboard writes; restore an earlier application version first."
      );
    }
    const parentById = new Map(
      generated.map((revision) => [revision.id, revision.parent_revision_id])
    );
    await db
      .updateTable("dashboards")
      .set({
        current_draft_revision_id:
          parentById.get(dashboard.current_draft_revision_id) ??
          dashboard.current_draft_revision_id,
        current_published_revision_id:
          parentById.get(dashboard.current_published_revision_id) ??
          dashboard.current_published_revision_id,
        next_revision_number: Math.min(...generated.map((revision) => revision.revision_number)),
        updated_at: new Date()
      })
      .where("id", "=", dashboard.id)
      .execute();
    generatedRevisionIds.push(...generatedIds);
  }
  if (generatedRevisionIds.length > 0) {
    await db.deleteFrom("dashboard_revisions").where("id", "in", generatedRevisionIds).execute();
  }
}

async function cloneCurrentRevision(db, dashboard, revisionId, revisionNumber) {
  const rows = await db
    .selectFrom("dashboard_revision_widgets")
    .selectAll()
    .where("revision_id", "=", revisionId)
    .orderBy("sort_order", "asc")
    .execute();
  if (!rows.some(needsUpgrade)) return null;
  const source = await db
    .selectFrom("dashboard_revisions")
    .selectAll()
    .where("id", "=", revisionId)
    .executeTakeFirstOrThrow();
  const id = randomUUID();
  await db
    .insertInto("dashboard_revisions")
    .values({
      created_at: new Date(),
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
    .values(rows.map((row) => upgradedWidget(row, id)))
    .execute();
  return id;
}

function upgradedWidget(row, revisionId) {
  if (!needsUpgrade(row)) {
    return {
      ...row,
      data_config: JSON.stringify(row.data_config),
      presentation_config: JSON.stringify(row.presentation_config),
      revision_id: revisionId
    };
  }
  const dataConfig = row.data_config ?? {};
  const presentationConfig = row.presentation_config ?? {};
  if (row.widget_type === "music.netease.ranking") {
    return {
      ...row,
      data_config: JSON.stringify({
        publicLimit: boundedLimit(dataConfig.publicLimit, 12, 30),
        publicRanges: ["week", "all_time"]
      }),
      presentation_config: JSON.stringify({
        rankingStyle: "editorial",
        showPlayCount: true,
        ...presentationConfig
      }),
      revision_id: revisionId,
      schema_version: 2,
      title: row.title === "网易云 · 听歌排行" ? "网易云 · 听歌双榜" : row.title
    };
  }
  const selection = explicitShowcaseSelection(dataConfig);
  return {
    ...row,
    data_config: JSON.stringify({ selections: selection ? [selection] : [] }),
    presentation_config: JSON.stringify({
      galleryStyle: "editorial",
      showMeta: true,
      ...presentationConfig
    }),
    revision_id: revisionId,
    schema_version: 2,
    title: row.title === "网易云 · 音乐名片" ? "网易云 · 音乐展柜" : row.title
  };
}

function needsUpgrade(row) {
  return row.schema_version === 1 && UPGRADED_TYPES.has(row.widget_type);
}

function explicitShowcaseSelection(config) {
  const sources = new Set([
    "weekly_track",
    "all_time_track",
    "created_playlist",
    "medal",
    "listening_duration",
    "provider_music_card"
  ]);
  return typeof config.resourceId === "string" &&
    config.resourceId.length > 0 &&
    sources.has(config.source)
    ? { resourceId: config.resourceId, source: config.source }
    : null;
}

function boundedLimit(value, fallback, maximum) {
  return Number.isInteger(value) && value >= 1 ? Math.min(value, maximum) : fallback;
}

async function generatedUpgrades(db, dashboardId) {
  const revisions = await db
    .selectFrom("dashboard_revisions")
    .select(["id", "parent_revision_id", "revision_number"])
    .where("dashboard_id", "=", dashboardId)
    .where("operation", "=", "schema_upgrade")
    .execute();
  const generated = [];
  for (const revision of revisions) {
    if (!revision.parent_revision_id) continue;
    const [childRows, parentRows] = await Promise.all([
      db
        .selectFrom("dashboard_revision_widgets")
        .select(["widget_id", "widget_type", "schema_version"])
        .where("revision_id", "=", revision.id)
        .execute(),
      db
        .selectFrom("dashboard_revision_widgets")
        .select(["widget_id", "widget_type", "schema_version"])
        .where("revision_id", "=", revision.parent_revision_id)
        .execute()
    ]);
    const parentByWidget = new Map(parentRows.map((row) => [row.widget_id, row]));
    if (
      childRows.some((row) => {
        const parent = parentByWidget.get(row.widget_id);
        return (
          row.schema_version === 2 &&
          UPGRADED_TYPES.has(row.widget_type) &&
          parent?.schema_version === 1 &&
          parent.widget_type === row.widget_type
        );
      })
    ) {
      generated.push(revision);
    }
  }
  return generated;
}
