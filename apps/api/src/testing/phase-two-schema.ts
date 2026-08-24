import type {
  DashboardStateKind,
  JsonObject,
  JsonValue,
  ResponsiveLayout,
  WidgetType
} from "@nivalis/domain";
import type { ColumnType, JSONColumnType, Kysely } from "kysely";

import {
  PHASE_TWO_DASHBOARD_ID,
  PHASE_TWO_DRAFT_STATE_ID,
  PHASE_TWO_OWNER_ID,
  PHASE_TWO_PROFILE_ID,
  PHASE_TWO_PUBLISHED_STATE_ID,
  phaseTwoDraft,
  phaseTwoLegacyWidgetTemplates,
  phaseTwoProfile
} from "../infrastructure/database/phase-two-fixture";

type Timestamp = ColumnType<Date, Date, Date>;

interface PhaseTwoProfilesTable {
  avatar_url: string;
  bio: string;
  created_at: Timestamp;
  display_name: string;
  handle: string;
  headline: string;
  id: string;
  owner_id: string;
  tags: JSONColumnType<readonly string[]>;
  updated_at: Timestamp;
}

interface PhaseTwoDashboardsTable {
  created_at: Timestamp;
  id: string;
  owner_id: string;
  profile_id: string;
  slug: string;
  updated_at: Timestamp;
}

interface PhaseTwoDashboardStatesTable {
  dashboard_id: string;
  id: string;
  layout: JSONColumnType<ResponsiveLayout>;
  state: DashboardStateKind;
  updated_at: Timestamp;
  version: number;
}

interface PhaseTwoWidgetInstancesTable {
  config: JSONColumnType<JsonObject>;
  dashboard_id: string;
  enabled: boolean;
  projection_data: ColumnType<JsonValue, string, string>;
  row_id: string;
  schema_version: number;
  sort_order: number;
  stale: boolean;
  state: DashboardStateKind;
  title: string;
  updated_at: Timestamp;
  widget_id: string;
  widget_type: WidgetType;
}

export interface PhaseTwoDatabase {
  dashboard_states: PhaseTwoDashboardStatesTable;
  dashboards: PhaseTwoDashboardsTable;
  profiles: PhaseTwoProfilesTable;
  widget_instances: PhaseTwoWidgetInstancesTable;
}

export async function seedPhaseTwoSchemaFixture(database: Kysely<PhaseTwoDatabase>) {
  const seededAt = new Date("2026-08-23T04:30:00.000Z");
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto("profiles")
      .values({
        avatar_url: phaseTwoProfile.avatarUrl,
        bio: phaseTwoProfile.bio,
        created_at: seededAt,
        display_name: phaseTwoProfile.displayName,
        handle: phaseTwoProfile.handle,
        headline: phaseTwoProfile.headline,
        id: PHASE_TWO_PROFILE_ID,
        owner_id: PHASE_TWO_OWNER_ID,
        tags: JSON.stringify(phaseTwoProfile.tags),
        updated_at: seededAt
      })
      .execute();
    await transaction
      .insertInto("dashboards")
      .values({
        created_at: seededAt,
        id: PHASE_TWO_DASHBOARD_ID,
        owner_id: PHASE_TWO_OWNER_ID,
        profile_id: PHASE_TWO_PROFILE_ID,
        slug: "about",
        updated_at: seededAt
      })
      .execute();
    for (const state of ["draft", "published"] as const) {
      const stateId = state === "draft" ? PHASE_TWO_DRAFT_STATE_ID : PHASE_TWO_PUBLISHED_STATE_ID;
      await transaction
        .insertInto("dashboard_states")
        .values({
          dashboard_id: PHASE_TWO_DASHBOARD_ID,
          id: stateId,
          layout: JSON.stringify(phaseTwoDraft.layout),
          state,
          updated_at: seededAt,
          version: 42
        })
        .execute();
      await transaction
        .insertInto("widget_instances")
        .values(
          phaseTwoLegacyWidgetTemplates.map((widget, index) => ({
            config: JSON.stringify(widget.dataConfig),
            dashboard_id: PHASE_TWO_DASHBOARD_ID,
            enabled: widget.enabled,
            projection_data: JSON.stringify(widget.data),
            row_id: seededRowId(state, index),
            schema_version: widget.schemaVersion,
            sort_order: index,
            stale: widget.stale,
            state,
            title: widget.title,
            updated_at: widget.updatedAt,
            widget_id: widget.id,
            widget_type: widget.type as WidgetType
          }))
        )
        .execute();
    }
  });
}

function seededRowId(state: DashboardStateKind, index: number) {
  const stateDigit = state === "draft" ? "1" : "2";
  return `00000000-0000-4000-8${stateDigit}00-${String(index + 1).padStart(12, "0")}`;
}
