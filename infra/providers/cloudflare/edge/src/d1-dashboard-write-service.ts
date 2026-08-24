import { validateDashboardDraft } from "@nivalis/application";
import {
  DashboardNotFoundError,
  RevisionConflictError,
  type DashboardDraftInput,
  type DashboardSnapshot
} from "@nivalis/domain";

import { D1DashboardConfigurationReader } from "./d1-dashboard-read-adapter";

export class D1DashboardWriteService {
  private readonly reader: D1DashboardConfigurationReader;

  constructor(private readonly database: D1Database) {
    this.reader = new D1DashboardConfigurationReader(database);
  }

  async saveDraft(ownerId: string, expectedRevisionId: string, input: DashboardDraftInput) {
    validateDashboardDraft(input);
    const revisionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `INSERT INTO dashboard_revisions
            (id, dashboard_id, revision_number, parent_revision_id,
             restored_from_revision_id, layout_json, operation, created_at, created_by)
           SELECT ?, dashboard.id, current.revision_number + 1, current.id,
                  NULL, ?, 'save', ?, ?
             FROM dashboards AS dashboard
             JOIN dashboard_revisions AS current
               ON current.id = dashboard.current_draft_revision_id
            WHERE dashboard.owner_id = ? AND dashboard.slug = 'about'
              AND dashboard.current_draft_revision_id = ?`
        )
        .bind(revisionId, JSON.stringify(input.layout), now, ownerId, ownerId, expectedRevisionId)
    ];

    input.widgets.forEach((widget, sortOrder) => {
      statements.push(
        this.database
          .prepare(
            `INSERT INTO widgets (id, dashboard_id, created_at)
             SELECT ?, dashboard.id, ?
               FROM dashboards AS dashboard
              WHERE dashboard.owner_id = ? AND dashboard.slug = 'about'
                AND dashboard.current_draft_revision_id = ?
             ON CONFLICT(id) DO NOTHING`
          )
          .bind(widget.id, now, ownerId, expectedRevisionId),
        this.database
          .prepare(
            `INSERT INTO dashboard_revision_widgets
              (revision_id, widget_id, widget_type, provider, schema_version,
               title, enabled, data_config_json, presentation_config_json, sort_order)
             SELECT ?, widget.id, ?, ?, ?, ?, ?, ?, ?, ?
               FROM widgets AS widget
               JOIN dashboards AS dashboard ON dashboard.id = widget.dashboard_id
              WHERE widget.id = ? AND dashboard.owner_id = ? AND dashboard.slug = 'about'
                AND dashboard.current_draft_revision_id = ?
                AND EXISTS (SELECT 1 FROM dashboard_revisions WHERE id = ?)`
          )
          .bind(
            revisionId,
            widget.type,
            widget.provider,
            widget.schemaVersion,
            widget.title,
            widget.enabled ? 1 : 0,
            JSON.stringify(widget.dataConfig),
            JSON.stringify(widget.presentationConfig),
            sortOrder,
            widget.id,
            ownerId,
            expectedRevisionId,
            revisionId
          )
      );
    });

    statements.push(
      this.database
        .prepare(
          `UPDATE dashboards
              SET current_draft_revision_id = ?, updated_at = ?
            WHERE owner_id = ? AND slug = 'about'
              AND current_draft_revision_id = ?
              AND EXISTS (SELECT 1 FROM dashboard_revisions WHERE id = ?)`
        )
        .bind(revisionId, now, ownerId, expectedRevisionId, revisionId)
    );

    const results = await this.database.batch(statements);
    if ((results.at(-1)?.meta.changes ?? 0) === 0) {
      return this.throwConflictOrNotFound(ownerId);
    }
    return this.requireCurrent(ownerId, "draft");
  }

  async publish(ownerId: string, expectedRevisionId: string) {
    const updated = await this.database
      .prepare(
        `UPDATE dashboards
            SET current_published_revision_id = current_draft_revision_id,
                updated_at = ?
          WHERE owner_id = ? AND slug = 'about'
            AND current_draft_revision_id = ?
        RETURNING id`
      )
      .bind(new Date().toISOString(), ownerId, expectedRevisionId)
      .first<{ readonly id: string }>();
    if (!updated) return this.throwConflictOrNotFound(ownerId);
    return this.requireCurrent(ownerId, "published");
  }

  private async requireCurrent(
    ownerId: string,
    state: "draft" | "published"
  ): Promise<DashboardSnapshot> {
    const dashboard = await this.reader.getCurrentForOwner(ownerId, "about", state);
    if (!dashboard) throw new DashboardNotFoundError("about");
    return dashboard;
  }

  private async throwConflictOrNotFound(ownerId: string): Promise<never> {
    const current = await this.reader.getCurrentForOwner(ownerId, "about", "draft");
    if (!current) throw new DashboardNotFoundError("about");
    throw new RevisionConflictError(current.revisionId, current.revision);
  }
}
