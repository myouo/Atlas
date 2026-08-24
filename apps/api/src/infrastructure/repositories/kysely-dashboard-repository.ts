import { randomUUID } from "node:crypto";

import type {
  CreateDraftRevisionCommand,
  DashboardRepository,
  DashboardUnitOfWork,
  RevisionMutationResult
} from "@nivalis/application";
import {
  DashboardNotFoundError,
  type DashboardRevisionMetadata,
  type DashboardRevisionPage,
  type DashboardRevisionSnapshot,
  type DashboardSlug,
  type DashboardSnapshot,
  type DashboardStateKind,
  type JsonObject,
  type Profile,
  type ResponsiveLayout,
  type WidgetConfiguration,
  type WidgetType
} from "@nivalis/domain";
import { type Kysely, sql, type Transaction } from "kysely";

import type { Database } from "../database/schema";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
type RevisionRow = Awaited<ReturnType<KyselyDashboardRepository["findRevisionRow"]>>;

export class KyselyDashboardRepository implements DashboardRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  getCurrentBySlug(dashboardSlug: DashboardSlug, state: DashboardStateKind) {
    return this.getCurrent(dashboardSlug, state);
  }

  getCurrentForOwner(ownerId: string, dashboardSlug: DashboardSlug, state: DashboardStateKind) {
    return this.getCurrent(dashboardSlug, state, ownerId);
  }

  async getRevisionForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    revisionId: string
  ): Promise<DashboardRevisionSnapshot | null> {
    const row = await this.findRevisionRow(dashboardSlug, revisionId, ownerId);
    if (!row) return null;
    return this.mapRevision(row);
  }

  async listRevisionsForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    options: { readonly beforeRevisionNumber?: number; readonly limit: number }
  ): Promise<DashboardRevisionPage> {
    const dashboard = await this.database
      .selectFrom("dashboards")
      .select(["id", "current_draft_revision_id", "current_published_revision_id"])
      .where("owner_id", "=", ownerId)
      .where("slug", "=", dashboardSlug)
      .executeTakeFirst();
    if (!dashboard) throw new DashboardNotFoundError(dashboardSlug);

    let query = this.database
      .selectFrom("dashboard_revisions")
      .select([
        "id",
        "revision_number",
        "parent_revision_id",
        "restored_from_revision_id",
        "operation",
        "created_at"
      ])
      .where("dashboard_id", "=", dashboard.id);
    if (options.beforeRevisionNumber !== undefined) {
      query = query.where("revision_number", "<", options.beforeRevisionNumber);
    }
    const rows = await query
      .orderBy("revision_number", "desc")
      .limit(options.limit + 1)
      .execute();
    const hasMore = rows.length > options.limit;
    const pageRows = rows.slice(0, options.limit);
    return {
      items: pageRows.map((row): DashboardRevisionMetadata => ({
        createdAt: row.created_at,
        isCurrentDraft: row.id === dashboard.current_draft_revision_id,
        isCurrentPublished: row.id === dashboard.current_published_revision_id,
        operation: row.operation,
        parentRevisionId: row.parent_revision_id,
        restoredFromRevisionId: row.restored_from_revision_id,
        revisionId: row.id,
        revisionNumber: row.revision_number
      })),
      nextCursorRevisionNumber:
        hasMore && pageRows.length > 0
          ? (pageRows[pageRows.length - 1]?.revision_number ?? null)
          : null
    };
  }

  async createDraftRevisionForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    command: CreateDraftRevisionCommand
  ): Promise<RevisionMutationResult> {
    const revisionId = randomUUID();
    const allocation = await this.database
      .updateTable("dashboards")
      .set({
        next_revision_number: sql<number>`next_revision_number + 1`,
        updated_at: command.now
      })
      .where("owner_id", "=", ownerId)
      .where("slug", "=", dashboardSlug)
      .where("current_draft_revision_id", "=", command.expectedRevisionId)
      .returning((expression) => [
        "id",
        expression.ref("current_published_revision_id").as("published_revision_id"),
        sql<number>`next_revision_number - 1`.as("revision_number")
      ])
      .executeTakeFirst();

    if (!allocation) return this.conflictOrThrow(ownerId, dashboardSlug);

    if (command.input.widgets.length > 0) {
      await this.database
        .insertInto("widgets")
        .values(
          command.input.widgets.map((widget) => ({
            created_at: command.now,
            dashboard_id: allocation.id,
            id: widget.id
          }))
        )
        .onConflict((conflict) => conflict.column("id").doNothing())
        .execute();
    }

    await this.database
      .insertInto("dashboard_revisions")
      .values({
        created_at: command.now,
        created_by: ownerId,
        dashboard_id: allocation.id,
        id: revisionId,
        layout: JSON.stringify(command.input.layout),
        operation: command.operation,
        parent_revision_id: command.expectedRevisionId,
        restored_from_revision_id: command.restoredFromRevisionId ?? null,
        revision_number: allocation.revision_number
      })
      .execute();

    if (command.input.widgets.length > 0) {
      await this.database
        .insertInto("dashboard_revision_widgets")
        .values(
          command.input.widgets.map((widget, sortOrder) => ({
            data_config: JSON.stringify(widget.dataConfig),
            dashboard_id: allocation.id,
            enabled: widget.enabled,
            presentation_config: JSON.stringify(widget.presentationConfig),
            provider: widget.provider,
            revision_id: revisionId,
            schema_version: widget.schemaVersion,
            sort_order: sortOrder,
            title: widget.title,
            widget_id: widget.id,
            widget_type: widget.type
          }))
        )
        .execute();
    }

    await this.database
      .updateTable("dashboards")
      .set({ current_draft_revision_id: revisionId })
      .where("id", "=", allocation.id)
      .executeTakeFirstOrThrow();

    const dashboard = await this.getCurrentForOwner(ownerId, dashboardSlug, "draft");
    if (!dashboard) throw new DashboardNotFoundError(dashboardSlug);
    return { dashboard, kind: "success" };
  }

  async publishCurrentDraftForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    expectedRevisionId: string,
    now: Date
  ): Promise<RevisionMutationResult> {
    const updated = await this.database
      .updateTable("dashboards")
      .set({ current_published_revision_id: expectedRevisionId, updated_at: now })
      .where("owner_id", "=", ownerId)
      .where("slug", "=", dashboardSlug)
      .where("current_draft_revision_id", "=", expectedRevisionId)
      .returning("id")
      .executeTakeFirst();
    if (!updated) return this.conflictOrThrow(ownerId, dashboardSlug);

    const dashboard = await this.getCurrentForOwner(ownerId, dashboardSlug, "published");
    if (!dashboard) throw new DashboardNotFoundError(dashboardSlug);
    return { dashboard, kind: "success" };
  }

  async ping(): Promise<void> {
    await sql`select 1`.execute(this.database);
  }

  private async getCurrent(
    dashboardSlug: DashboardSlug,
    state: DashboardStateKind,
    ownerId?: string
  ): Promise<DashboardSnapshot | null> {
    const pointer =
      state === "draft"
        ? "dashboards.current_draft_revision_id"
        : "dashboards.current_published_revision_id";
    let query = this.database
      .selectFrom("dashboards")
      .innerJoin("profiles", "profiles.id", "dashboards.profile_id")
      .innerJoin("dashboard_revisions", "dashboard_revisions.id", pointer)
      .select([
        "dashboards.id as dashboard_db_id",
        "dashboards.slug as dashboard_slug",
        "dashboards.current_draft_revision_id",
        "dashboards.current_published_revision_id",
        "dashboard_revisions.id as revision_id",
        "dashboard_revisions.revision_number",
        "dashboard_revisions.parent_revision_id",
        "dashboard_revisions.restored_from_revision_id",
        "dashboard_revisions.layout",
        "dashboard_revisions.operation",
        "dashboard_revisions.created_at as revision_created_at",
        "profiles.avatar_url",
        "profiles.bio",
        "profiles.display_name",
        "profiles.handle",
        "profiles.headline",
        "profiles.tags"
      ])
      .where("dashboards.slug", "=", dashboardSlug);
    if (ownerId) query = query.where("dashboards.owner_id", "=", ownerId);
    const row = await query.executeTakeFirst();
    if (!row) return null;

    return {
      dashboardId: row.dashboard_slug as DashboardSlug,
      layout: row.layout as ResponsiveLayout,
      profile: this.mapProfile(row),
      revision: row.revision_number,
      revisionId: row.revision_id,
      state,
      updatedAt: row.revision_created_at,
      widgets: await this.getWidgets(row.revision_id)
    };
  }

  private async findRevisionRow(dashboardSlug: DashboardSlug, revisionId: string, ownerId: string) {
    return this.database
      .selectFrom("dashboards")
      .innerJoin("profiles", "profiles.id", "dashboards.profile_id")
      .innerJoin("dashboard_revisions", "dashboard_revisions.dashboard_id", "dashboards.id")
      .select([
        "dashboards.id as dashboard_db_id",
        "dashboards.slug as dashboard_slug",
        "dashboards.current_draft_revision_id",
        "dashboards.current_published_revision_id",
        "dashboard_revisions.id as revision_id",
        "dashboard_revisions.revision_number",
        "dashboard_revisions.parent_revision_id",
        "dashboard_revisions.restored_from_revision_id",
        "dashboard_revisions.layout",
        "dashboard_revisions.operation",
        "dashboard_revisions.created_at as revision_created_at",
        "profiles.avatar_url",
        "profiles.bio",
        "profiles.display_name",
        "profiles.handle",
        "profiles.headline",
        "profiles.tags"
      ])
      .where("dashboards.owner_id", "=", ownerId)
      .where("dashboards.slug", "=", dashboardSlug)
      .where("dashboard_revisions.id", "=", revisionId)
      .executeTakeFirst();
  }

  private async mapRevision(row: NonNullable<RevisionRow>): Promise<DashboardRevisionSnapshot> {
    return {
      createdAt: row.revision_created_at,
      dashboardId: row.dashboard_slug as DashboardSlug,
      isCurrentDraft: row.revision_id === row.current_draft_revision_id,
      isCurrentPublished: row.revision_id === row.current_published_revision_id,
      layout: row.layout as ResponsiveLayout,
      operation: row.operation,
      parentRevisionId: row.parent_revision_id,
      profile: this.mapProfile(row),
      restoredFromRevisionId: row.restored_from_revision_id,
      revisionId: row.revision_id,
      revisionNumber: row.revision_number,
      widgets: await this.getWidgets(row.revision_id)
    };
  }

  private mapProfile(row: {
    readonly avatar_url: string;
    readonly bio: string;
    readonly display_name: string;
    readonly handle: string;
    readonly headline: string;
    readonly tags: readonly string[];
  }): Profile {
    return {
      avatarUrl: row.avatar_url,
      bio: row.bio,
      displayName: row.display_name,
      handle: row.handle,
      headline: row.headline,
      tags: row.tags
    };
  }

  private async getWidgets(revisionId: string): Promise<readonly WidgetConfiguration[]> {
    const rows = await this.database
      .selectFrom("dashboard_revision_widgets")
      .selectAll()
      .where("revision_id", "=", revisionId)
      .orderBy("sort_order", "asc")
      .execute();
    return rows.map((widget): WidgetConfiguration => ({
      dataConfig: widget.data_config as JsonObject,
      enabled: widget.enabled,
      id: widget.widget_id,
      presentationConfig: widget.presentation_config as JsonObject,
      provider: widget.provider,
      schemaVersion: widget.schema_version,
      title: widget.title,
      type: widget.widget_type as WidgetType
    }));
  }

  private async conflictOrThrow(
    ownerId: string,
    dashboardSlug: DashboardSlug
  ): Promise<RevisionMutationResult> {
    const current = await this.database
      .selectFrom("dashboards")
      .innerJoin(
        "dashboard_revisions",
        "dashboard_revisions.id",
        "dashboards.current_draft_revision_id"
      )
      .select(["dashboard_revisions.id as revision_id", "dashboard_revisions.revision_number"])
      .where("dashboards.owner_id", "=", ownerId)
      .where("dashboards.slug", "=", dashboardSlug)
      .executeTakeFirst();
    if (!current) throw new DashboardNotFoundError(dashboardSlug);
    return {
      current: {
        revisionId: current.revision_id,
        revisionNumber: current.revision_number
      },
      kind: "conflict"
    };
  }
}

export class KyselyDashboardUnitOfWork implements DashboardUnitOfWork {
  constructor(private readonly database: Kysely<Database>) {}

  run<T>(work: (repository: DashboardRepository) => Promise<T>): Promise<T> {
    return this.database
      .transaction()
      .execute((transaction) => work(new KyselyDashboardRepository(transaction)));
  }
}
