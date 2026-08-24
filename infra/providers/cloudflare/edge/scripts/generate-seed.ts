import {
  PHASE_THREE_INITIAL_REVISION_ID,
  PHASE_TWO_DASHBOARD_ID,
  PHASE_TWO_OWNER_ID,
  PHASE_TWO_PROFILE_ID,
  phaseTwoLayout,
  phaseTwoProfile,
  phaseTwoWidgets
} from "../../../../../apps/api/src/infrastructure/database/phase-two-fixture";

import { createPortableProjectionKey } from "../src/projection-key";

const timestamp = "2026-08-23T04:30:00.000Z";
const statements: string[] = [
  insert(
    "profiles",
    [
      "id",
      "owner_id",
      "display_name",
      "handle",
      "headline",
      "bio",
      "avatar_url",
      "tags_json",
      "created_at",
      "updated_at"
    ],
    [
      PHASE_TWO_PROFILE_ID,
      PHASE_TWO_OWNER_ID,
      phaseTwoProfile.displayName,
      phaseTwoProfile.handle,
      phaseTwoProfile.headline,
      phaseTwoProfile.bio,
      phaseTwoProfile.avatarUrl,
      JSON.stringify(phaseTwoProfile.tags),
      timestamp,
      timestamp
    ]
  ),
  insert(
    "dashboards",
    ["id", "owner_id", "profile_id", "slug", "created_at", "updated_at"],
    [
      PHASE_TWO_DASHBOARD_ID,
      PHASE_TWO_OWNER_ID,
      PHASE_TWO_PROFILE_ID,
      "about",
      timestamp,
      timestamp
    ]
  ),
  insert(
    "dashboard_revisions",
    ["id", "dashboard_id", "revision_number", "layout_json", "operation", "created_at"],
    [
      PHASE_THREE_INITIAL_REVISION_ID,
      PHASE_TWO_DASHBOARD_ID,
      1,
      JSON.stringify(phaseTwoLayout),
      "seed",
      timestamp
    ]
  )
];

for (const [index, widget] of phaseTwoWidgets.entries()) {
  const projectionKey = await createPortableProjectionKey(widget);
  const isNetease = widget.type === "music.netease.overview";
  statements.push(
    insert(
      "widgets",
      ["id", "dashboard_id", "created_at"],
      [widget.id, PHASE_TWO_DASHBOARD_ID, timestamp]
    ),
    insert(
      "dashboard_revision_widgets",
      [
        "revision_id",
        "widget_id",
        "widget_type",
        "provider",
        "schema_version",
        "title",
        "enabled",
        "data_config_json",
        "presentation_config_json",
        "sort_order"
      ],
      [
        PHASE_THREE_INITIAL_REVISION_ID,
        widget.id,
        widget.type,
        widget.provider,
        widget.schemaVersion,
        widget.title,
        widget.enabled ? 1 : 0,
        JSON.stringify(widget.dataConfig),
        JSON.stringify(widget.presentationConfig),
        index
      ]
    ),
    insert(
      "widget_projections",
      [
        "widget_id",
        "projection_key",
        "projection_version_id",
        "provider",
        "projection_schema_version",
        "data_json",
        "stale",
        "generated_at",
        "last_success_at"
      ],
      [
        widget.id,
        projectionKey,
        `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`,
        widget.provider,
        widget.schemaVersion,
        JSON.stringify(isNetease ? unavailableNeteaseProjection() : widget.data),
        widget.stale ? 1 : 0,
        timestamp,
        timestamp
      ],
      isNetease ? "nothing" : "update"
    )
  );
}

statements.push(
  `UPDATE dashboards SET current_draft_revision_id = ${sql(PHASE_THREE_INITIAL_REVISION_ID)}, current_published_revision_id = ${sql(PHASE_THREE_INITIAL_REVISION_ID)} WHERE id = ${sql(PHASE_TWO_DASHBOARD_ID)};`
);

process.stdout.write(`${statements.join("\n")}\n`);

function insert(
  table: string,
  columns: readonly string[],
  values: readonly unknown[],
  conflict: "nothing" | "update" = "update"
) {
  if (conflict === "nothing") {
    return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map(sql).join(", ")}) ON CONFLICT DO NOTHING;`;
  }
  const assignments = columns.map((column) => `${column}=excluded.${column}`).join(", ");
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map(sql).join(", ")}) ON CONFLICT DO UPDATE SET ${assignments};`;
}

function unavailableNeteaseProjection() {
  const unavailable = { availability: "unavailable", reason: "not_synced" };
  return {
    account: unavailable,
    listeningDuration: unavailable,
    provider: "netease",
    recentListening: unavailable,
    totalListenCount: unavailable,
    trend: unavailable,
    weeklyListening: unavailable
  };
}

function sql(value: unknown) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
