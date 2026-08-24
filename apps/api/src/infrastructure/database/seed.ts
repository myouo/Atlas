import type { NivalisDatabase } from "./database";
import { createProjectionKey } from "../projections/projection-key";
import {
  PHASE_FOUR_FIXTURE_CONNECTION_ID,
  PHASE_FIVE_NETEASE_CONNECTION_ID,
  PHASE_THREE_INITIAL_REVISION_ID,
  PHASE_TWO_DASHBOARD_ID,
  PHASE_TWO_OWNER_ID,
  PHASE_TWO_PROFILE_ID,
  phaseTwoDraft,
  phaseTwoProfile,
  phaseTwoWidgets
} from "./phase-two-fixture";

export async function seedPhaseFiveFixture(database: NivalisDatabase): Promise<void> {
  const seededAt = new Date("2026-08-23T04:30:00.000Z");

  await database.transaction().execute(async (transaction) => {
    await transaction.deleteFrom("provider_auth_attempts").execute();
    await transaction.deleteFrom("netease_metric_snapshots").execute();
    await transaction.deleteFrom("netease_track_play_snapshots").execute();
    await transaction.deleteFrom("netease_recent_listens").execute();
    await transaction.deleteFrom("netease_track_artists").execute();
    await transaction.deleteFrom("netease_artists").execute();
    await transaction.deleteFrom("netease_tracks").execute();
    await transaction.deleteFrom("netease_accounts").execute();
    await transaction
      .deleteFrom("provider_connections")
      .where("owner_id", "=", PHASE_TWO_OWNER_ID)
      .execute();
    await transaction
      .deleteFrom("dashboards")
      .where("owner_id", "=", PHASE_TWO_OWNER_ID)
      .where("slug", "=", "about")
      .execute();

    const profile = await transaction
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
      .onConflict((conflict) =>
        conflict.column("owner_id").doUpdateSet({
          avatar_url: phaseTwoProfile.avatarUrl,
          bio: phaseTwoProfile.bio,
          display_name: phaseTwoProfile.displayName,
          handle: phaseTwoProfile.handle,
          headline: phaseTwoProfile.headline,
          tags: JSON.stringify(phaseTwoProfile.tags),
          updated_at: seededAt
        })
      )
      .returning("id")
      .executeTakeFirstOrThrow();

    await transaction
      .insertInto("dashboards")
      .values({
        created_at: seededAt,
        current_draft_revision_id: PHASE_THREE_INITIAL_REVISION_ID,
        current_published_revision_id: PHASE_THREE_INITIAL_REVISION_ID,
        id: PHASE_TWO_DASHBOARD_ID,
        next_revision_number: 2,
        owner_id: PHASE_TWO_OWNER_ID,
        profile_id: profile.id,
        slug: "about",
        updated_at: seededAt
      })
      .execute();

    await transaction
      .insertInto("dashboard_revisions")
      .values({
        created_at: seededAt,
        created_by: null,
        dashboard_id: PHASE_TWO_DASHBOARD_ID,
        id: PHASE_THREE_INITIAL_REVISION_ID,
        layout: JSON.stringify(phaseTwoDraft.layout),
        operation: "seed",
        parent_revision_id: null,
        restored_from_revision_id: null,
        revision_number: 1
      })
      .execute();

    await transaction
      .insertInto("widgets")
      .values(
        phaseTwoWidgets.map((widget) => ({
          created_at: seededAt,
          dashboard_id: PHASE_TWO_DASHBOARD_ID,
          id: widget.id
        }))
      )
      .execute();

    await transaction
      .insertInto("dashboard_revision_widgets")
      .values(
        phaseTwoWidgets.map((widget, sortOrder) => ({
          data_config: JSON.stringify(widget.dataConfig),
          dashboard_id: PHASE_TWO_DASHBOARD_ID,
          enabled: widget.enabled,
          presentation_config: JSON.stringify(widget.presentationConfig),
          provider: widget.provider,
          revision_id: PHASE_THREE_INITIAL_REVISION_ID,
          schema_version: widget.schemaVersion,
          sort_order: sortOrder,
          title: widget.title,
          widget_id: widget.id,
          widget_type: widget.type
        }))
      )
      .execute();

    await transaction
      .insertInto("provider_connections")
      .values([
        {
          account_key: "development-fixture",
          created_at: seededAt,
          enabled: true,
          id: PHASE_FOUR_FIXTURE_CONNECTION_ID,
          owner_id: PHASE_TWO_OWNER_ID,
          provider: "fixture",
          updated_at: seededAt
        },
        {
          account_key: "sanitized-fixture",
          created_at: seededAt,
          enabled: false,
          id: PHASE_FIVE_NETEASE_CONNECTION_ID,
          owner_id: PHASE_TWO_OWNER_ID,
          provider: "netease",
          updated_at: seededAt
        }
      ])
      .execute();

    await transaction
      .insertInto("provider_sync_states")
      .values([
        {
          attempt_count: 0,
          last_attempt_at: seededAt,
          last_error_at: null,
          last_error_code: null,
          last_error_message: null,
          last_success_at: seededAt,
          last_successful_run_id: null,
          provider: "fixture",
          provider_connection_id: PHASE_FOUR_FIXTURE_CONNECTION_ID,
          status: "completed",
          updated_at: seededAt
        },
        {
          attempt_count: 0,
          last_attempt_at: null,
          last_error_at: null,
          last_error_code: null,
          last_error_message: null,
          last_success_at: null,
          last_successful_run_id: null,
          provider: "netease",
          provider_connection_id: PHASE_FIVE_NETEASE_CONNECTION_ID,
          status: "idle",
          updated_at: seededAt
        }
      ])
      .execute();

    await transaction
      .insertInto("widget_projections")
      .values(
        phaseTwoWidgets.map((widget) => ({
          data: JSON.stringify(widget.data),
          generated_at: widget.updatedAt,
          last_success_at: widget.updatedAt,
          projection_key: createProjectionKey(widget),
          projection_schema_version: widget.schemaVersion,
          projection_version_id: PHASE_THREE_INITIAL_REVISION_ID,
          provider: widget.provider,
          provider_connection_id:
            widget.provider === "netease"
              ? PHASE_FIVE_NETEASE_CONNECTION_ID
              : PHASE_FOUR_FIXTURE_CONNECTION_ID,
          source_snapshot_id: null,
          stale: widget.stale,
          widget_id: widget.id
        }))
      )
      .execute();
  });
}
