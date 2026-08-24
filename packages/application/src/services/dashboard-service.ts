import {
  ABOUT_DASHBOARD_SLUG,
  DashboardNotFoundError,
  DashboardRevisionNotFoundError,
  RevisionConflictError,
  WidgetAlreadyExistsError,
  WidgetNotFoundError
} from "@nivalis/domain";
import type {
  DashboardDraftInput,
  DashboardRevisionPage,
  DashboardRevisionSnapshot,
  DashboardSnapshot,
  OwnerContext,
  Profile,
  WidgetConfiguration,
  WidgetPlacement
} from "@nivalis/domain";

import type {
  Clock,
  DashboardRepository,
  DashboardUnitOfWork,
  RevisionMutationResult
} from "../ports/dashboard-repository";
import { validateDashboardDraft } from "../validation/dashboard-validation";

export interface UpdateWidgetInput {
  readonly dataConfig?: WidgetConfiguration["dataConfig"];
  readonly enabled?: boolean;
  readonly presentationConfig?: WidgetConfiguration["presentationConfig"];
  readonly title?: string;
}

function toDraftInput(
  snapshot: DashboardSnapshot | DashboardRevisionSnapshot
): DashboardDraftInput {
  return { layout: snapshot.layout, widgets: snapshot.widgets };
}

function unwrapMutation(result: RevisionMutationResult): DashboardSnapshot {
  if (result.kind === "conflict") {
    throw new RevisionConflictError(result.current.revisionId, result.current.revisionNumber);
  }
  return result.dashboard;
}

function assertExpectedDraft(draft: DashboardSnapshot, expectedRevisionId: string) {
  if (draft.revisionId !== expectedRevisionId) {
    throw new RevisionConflictError(draft.revisionId, draft.revision);
  }
}

export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly unitOfWork: DashboardUnitOfWork,
    private readonly clock: Clock
  ) {}

  async getPublicProfile(): Promise<Profile> {
    const dashboard = await this.getPublishedDashboard();
    return dashboard.profile;
  }

  async getPublishedDashboard(): Promise<DashboardSnapshot> {
    const dashboard = await this.repository.getCurrentBySlug(ABOUT_DASHBOARD_SLUG, "published");
    if (!dashboard) throw new DashboardNotFoundError(ABOUT_DASHBOARD_SLUG);
    return dashboard;
  }

  async getDraftDashboard(context: OwnerContext): Promise<DashboardSnapshot> {
    const dashboard = await this.repository.getCurrentForOwner(
      context.actorId,
      ABOUT_DASHBOARD_SLUG,
      "draft"
    );
    if (!dashboard) throw new DashboardNotFoundError(ABOUT_DASHBOARD_SLUG);
    return dashboard;
  }

  async saveDraft(
    context: OwnerContext,
    expectedRevisionId: string,
    input: DashboardDraftInput
  ): Promise<DashboardSnapshot> {
    validateDashboardDraft(input);
    return this.unitOfWork.run(async (repository) =>
      unwrapMutation(
        await repository.createDraftRevisionForOwner(context.actorId, ABOUT_DASHBOARD_SLUG, {
          expectedRevisionId,
          input,
          now: this.clock.now(),
          operation: "save"
        })
      )
    );
  }

  async publish(context: OwnerContext, expectedRevisionId: string): Promise<DashboardSnapshot> {
    return this.unitOfWork.run(async (repository) =>
      unwrapMutation(
        await repository.publishCurrentDraftForOwner(
          context.actorId,
          ABOUT_DASHBOARD_SLUG,
          expectedRevisionId,
          this.clock.now()
        )
      )
    );
  }

  async createWidget(
    context: OwnerContext,
    expectedRevisionId: string,
    widget: WidgetConfiguration,
    placement: WidgetPlacement
  ): Promise<DashboardSnapshot> {
    return this.unitOfWork.run(async (repository) => {
      const draft = await this.requireDraft(repository, context.actorId);
      assertExpectedDraft(draft, expectedRevisionId);
      if (draft.widgets.some((candidate) => candidate.id === widget.id)) {
        throw new WidgetAlreadyExistsError(widget.id);
      }
      const next: DashboardDraftInput = {
        layout: {
          lg: [...draft.layout.lg, placement.lg],
          md: [...draft.layout.md, placement.md],
          sm: [...draft.layout.sm, placement.sm]
        },
        widgets: [...draft.widgets, widget]
      };
      validateDashboardDraft(next);
      return unwrapMutation(
        await repository.createDraftRevisionForOwner(context.actorId, ABOUT_DASHBOARD_SLUG, {
          expectedRevisionId,
          input: next,
          now: this.clock.now(),
          operation: "widget_add"
        })
      );
    });
  }

  async updateWidget(
    context: OwnerContext,
    expectedRevisionId: string,
    widgetId: string,
    patch: UpdateWidgetInput
  ): Promise<DashboardSnapshot> {
    return this.unitOfWork.run(async (repository) => {
      const draft = await this.requireDraft(repository, context.actorId);
      assertExpectedDraft(draft, expectedRevisionId);
      const current = draft.widgets.find((widget) => widget.id === widgetId);
      if (!current) throw new WidgetNotFoundError(widgetId);
      const updated: WidgetConfiguration = {
        ...current,
        ...(patch.dataConfig ? { dataConfig: patch.dataConfig } : {}),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.presentationConfig ? { presentationConfig: patch.presentationConfig } : {}),
        ...(patch.title ? { title: patch.title } : {})
      };
      const next: DashboardDraftInput = {
        layout: draft.layout,
        widgets: draft.widgets.map((widget) => (widget.id === widgetId ? updated : widget))
      };
      validateDashboardDraft(next);
      return unwrapMutation(
        await repository.createDraftRevisionForOwner(context.actorId, ABOUT_DASHBOARD_SLUG, {
          expectedRevisionId,
          input: next,
          now: this.clock.now(),
          operation: "widget_update"
        })
      );
    });
  }

  async deleteWidget(
    context: OwnerContext,
    expectedRevisionId: string,
    widgetId: string
  ): Promise<DashboardSnapshot> {
    return this.unitOfWork.run(async (repository) => {
      const draft = await this.requireDraft(repository, context.actorId);
      assertExpectedDraft(draft, expectedRevisionId);
      if (!draft.widgets.some((widget) => widget.id === widgetId)) {
        throw new WidgetNotFoundError(widgetId);
      }
      const next: DashboardDraftInput = {
        layout: {
          lg: draft.layout.lg.filter((item) => item.i !== widgetId),
          md: draft.layout.md.filter((item) => item.i !== widgetId),
          sm: draft.layout.sm.filter((item) => item.i !== widgetId)
        },
        widgets: draft.widgets.filter((widget) => widget.id !== widgetId)
      };
      validateDashboardDraft(next);
      return unwrapMutation(
        await repository.createDraftRevisionForOwner(context.actorId, ABOUT_DASHBOARD_SLUG, {
          expectedRevisionId,
          input: next,
          now: this.clock.now(),
          operation: "widget_delete"
        })
      );
    });
  }

  async listRevisions(
    context: OwnerContext,
    options: { readonly beforeRevisionNumber?: number; readonly limit: number }
  ): Promise<DashboardRevisionPage> {
    return this.repository.listRevisionsForOwner(context.actorId, ABOUT_DASHBOARD_SLUG, options);
  }

  async getRevision(context: OwnerContext, revisionId: string): Promise<DashboardRevisionSnapshot> {
    const revision = await this.repository.getRevisionForOwner(
      context.actorId,
      ABOUT_DASHBOARD_SLUG,
      revisionId
    );
    if (!revision) throw new DashboardRevisionNotFoundError(revisionId);
    return revision;
  }

  async restoreRevision(
    context: OwnerContext,
    expectedRevisionId: string,
    revisionId: string
  ): Promise<DashboardSnapshot> {
    return this.unitOfWork.run(async (repository) => {
      const draft = await this.requireDraft(repository, context.actorId);
      assertExpectedDraft(draft, expectedRevisionId);
      const source = await repository.getRevisionForOwner(
        context.actorId,
        ABOUT_DASHBOARD_SLUG,
        revisionId
      );
      if (!source) throw new DashboardRevisionNotFoundError(revisionId);
      const input = toDraftInput(source);
      validateDashboardDraft(input);
      return unwrapMutation(
        await repository.createDraftRevisionForOwner(context.actorId, ABOUT_DASHBOARD_SLUG, {
          expectedRevisionId,
          input,
          now: this.clock.now(),
          operation: "restore",
          restoredFromRevisionId: source.revisionId
        })
      );
    });
  }

  async isReady(): Promise<boolean> {
    try {
      await this.repository.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async requireDraft(
    repository: DashboardRepository,
    ownerId: string
  ): Promise<DashboardSnapshot> {
    const draft = await repository.getCurrentForOwner(ownerId, ABOUT_DASHBOARD_SLUG, "draft");
    if (!draft) throw new DashboardNotFoundError(ABOUT_DASHBOARD_SLUG);
    return draft;
  }
}
