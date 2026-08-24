import {
  ABOUT_DASHBOARD_SLUG,
  InvalidDashboardError,
  RevisionConflictError
} from "@nivalis/domain";
import type {
  DashboardDraftInput,
  DashboardRevisionMetadata,
  DashboardRevisionPage,
  DashboardRevisionSnapshot,
  DashboardSnapshot,
  DashboardStateKind,
  OwnerContext,
  WidgetProjection
} from "@nivalis/domain";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  Clock,
  CreateDraftRevisionCommand,
  DashboardRepository,
  DashboardUnitOfWork,
  RevisionMutationResult
} from "../ports/dashboard-repository";
import { DashboardService } from "./dashboard-service";

const owner: OwnerContext = {
  actorId: "00000000-0000-4000-8000-000000000001"
};
const now = new Date("2026-08-23T08:00:00.000Z");
const initialRevisionId = revisionId(1);

function widget(id = "00000000-0000-4000-8000-000000000101"): WidgetProjection {
  return {
    dataConfig: {},
    data: { metric: "uptime_days", unit: "days", value: 427 },
    enabled: true,
    id,
    presentationConfig: {},
    provider: "fixture",
    schemaVersion: 1,
    stale: false,
    title: "累计运行天数",
    type: "system.stats",
    updatedAt: now
  };
}

function snapshot(state: DashboardStateKind): DashboardSnapshot {
  const item = { h: 2, i: widget().id, w: 2, x: 0, y: 0 };
  return {
    dashboardId: ABOUT_DASHBOARD_SLUG,
    layout: { lg: [item], md: [item], sm: [item] },
    profile: {
      avatarUrl: "/images/mock-avatar-profile.webp",
      bio: "Fixture",
      displayName: "Nivalis",
      handle: "@nivalis",
      headline: "Developer",
      tags: ["Coding"]
    },
    revision: 1,
    revisionId: initialRevisionId,
    state,
    updatedAt: now,
    widgets: [widget()]
  };
}

class FakeDashboardRepository implements DashboardRepository {
  draft = snapshot("draft");
  published = snapshot("published");
  readonly revisions = new Map<string, DashboardRevisionSnapshot>([
    [initialRevisionId, toRevision(snapshot("draft"), null, null, "seed")]
  ]);

  async getCurrentBySlug(_slug: "about", state: DashboardStateKind) {
    return structuredClone(state === "draft" ? this.draft : this.published);
  }

  async getCurrentForOwner(_ownerId: string, _slug: "about", state: DashboardStateKind) {
    return this.getCurrentBySlug(_slug, state);
  }

  async createDraftRevisionForOwner(
    _ownerId: string,
    _slug: "about",
    command: CreateDraftRevisionCommand
  ): Promise<RevisionMutationResult> {
    if (command.expectedRevisionId !== this.draft.revisionId) return this.conflict();
    const revision = this.draft.revision + 1;
    const id = revisionId(revision);
    const next: DashboardSnapshot = {
      ...this.draft,
      layout: structuredClone(command.input.layout),
      revision,
      revisionId: id,
      updatedAt: command.now,
      widgets: structuredClone(command.input.widgets)
    };
    this.revisions.set(
      id,
      toRevision(
        next,
        this.draft.revisionId,
        command.restoredFromRevisionId ?? null,
        command.operation
      )
    );
    this.draft = structuredClone(next);
    return { dashboard: structuredClone(next), kind: "success" };
  }

  async publishCurrentDraftForOwner(
    _ownerId: string,
    _slug: "about",
    expectedRevisionId: string,
    _now: Date
  ): Promise<RevisionMutationResult> {
    void _now;
    if (expectedRevisionId !== this.draft.revisionId) return this.conflict();
    this.published = { ...structuredClone(this.draft), state: "published" };
    return { dashboard: structuredClone(this.published), kind: "success" };
  }

  async getRevisionForOwner(_ownerId: string, _slug: "about", id: string) {
    const revision = this.revisions.get(id);
    return revision ? this.withMarkers(revision) : null;
  }

  async listRevisionsForOwner(
    _ownerId: string,
    _slug: "about",
    options: { readonly beforeRevisionNumber?: number; readonly limit: number }
  ): Promise<DashboardRevisionPage> {
    const revisions = [...this.revisions.values()]
      .filter(
        (revision) =>
          options.beforeRevisionNumber === undefined ||
          revision.revisionNumber < options.beforeRevisionNumber
      )
      .sort((left, right) => right.revisionNumber - left.revisionNumber);
    const items = revisions.slice(0, options.limit).map((revision) => this.withMarkers(revision));
    return {
      items,
      nextCursorRevisionNumber:
        revisions.length > options.limit ? (items[items.length - 1]?.revisionNumber ?? null) : null
    };
  }

  async ping() {}

  private conflict(): RevisionMutationResult {
    return {
      current: { revisionId: this.draft.revisionId, revisionNumber: this.draft.revision },
      kind: "conflict"
    };
  }

  private withMarkers(revision: DashboardRevisionSnapshot): DashboardRevisionSnapshot {
    return {
      ...structuredClone(revision),
      isCurrentDraft: revision.revisionId === this.draft.revisionId,
      isCurrentPublished: revision.revisionId === this.published.revisionId
    };
  }
}

class FakeUnitOfWork implements DashboardUnitOfWork {
  constructor(private readonly repository: FakeDashboardRepository) {}

  run<T>(work: (repository: DashboardRepository) => Promise<T>): Promise<T> {
    return work(this.repository);
  }
}

const clock: Clock = { now: () => now };

describe("DashboardService immutable revision lifecycle", () => {
  let repository: FakeDashboardRepository;
  let service: DashboardService;

  beforeEach(() => {
    repository = new FakeDashboardRepository();
    service = new DashboardService(repository, new FakeUnitOfWork(repository), clock);
  });

  it("creates a new Draft revision without changing Published", async () => {
    const draft = await service.getDraftDashboard(owner);
    const changed: DashboardDraftInput = {
      layout: { ...draft.layout, lg: [{ ...draft.layout.lg[0]!, x: 3 }] },
      widgets: draft.widgets
    };
    const saved = await service.saveDraft(owner, draft.revisionId, changed);
    expect(saved).toMatchObject({ revision: 2, revisionId: revisionId(2) });
    expect((await service.getPublishedDashboard()).revisionId).toBe(initialRevisionId);
    expect((await service.getRevision(owner, initialRevisionId)).layout.lg[0]?.x).toBe(0);
  });

  it("maps a stale expected revision to a semantic conflict", async () => {
    const draft = await service.getDraftDashboard(owner);
    await service.saveDraft(owner, draft.revisionId, toInput(draft));
    await expect(service.saveDraft(owner, draft.revisionId, toInput(draft))).rejects.toMatchObject({
      currentRevisionId: revisionId(2),
      currentRevisionNumber: 2
    });
    await expect(service.saveDraft(owner, draft.revisionId, toInput(draft))).rejects.toBeInstanceOf(
      RevisionConflictError
    );
  });

  it("publishes by moving the pointer without creating content", async () => {
    const initial = await service.getDraftDashboard(owner);
    const saved = await service.saveDraft(owner, initial.revisionId, {
      ...toInput(initial),
      layout: { ...initial.layout, lg: [{ ...initial.layout.lg[0]!, x: 4 }] }
    });
    const historyBefore = await service.listRevisions(owner, { limit: 20 });
    const published = await service.publish(owner, saved.revisionId);
    expect(published).toMatchObject({ revision: 2, revisionId: saved.revisionId });
    expect((await service.listRevisions(owner, { limit: 20 })).items).toHaveLength(
      historyBefore.items.length
    );
  });

  it("rejects invalid layouts before a revision write", async () => {
    const draft = await service.getDraftDashboard(owner);
    await expect(
      service.saveDraft(owner, draft.revisionId, {
        layout: { ...draft.layout, sm: [] },
        widgets: draft.widgets
      })
    ).rejects.toBeInstanceOf(InvalidDashboardError);
    expect((await service.getDraftDashboard(owner)).revision).toBe(1);
  });

  it("creates and deletes a Widget without damaging the historical snapshot", async () => {
    const initial = await service.getDraftDashboard(owner);
    const newWidget = widget("00000000-0000-4000-8000-000000000102");
    const placement = { h: 2, i: newWidget.id, w: 2, x: 2, y: 0 };
    const added = await service.createWidget(owner, initial.revisionId, newWidget, {
      lg: placement,
      md: placement,
      sm: placement
    });
    expect(added.widgets).toHaveLength(2);
    const deleted = await service.deleteWidget(owner, added.revisionId, newWidget.id);
    expect(deleted.widgets).toHaveLength(1);
    expect((await service.getRevision(owner, added.revisionId)).widgets).toHaveLength(2);
  });

  it("updates Widget semantics and retains placement when disabled", async () => {
    const initial = await service.getDraftDashboard(owner);
    const updated = await service.updateWidget(owner, initial.revisionId, widget().id, {
      enabled: false,
      title: "Disabled fixture"
    });
    expect(updated.widgets[0]).toMatchObject({ enabled: false, title: "Disabled fixture" });
    expect(updated.layout.lg[0]?.i).toBe(widget().id);
  });

  it("restores by cloning history into a new Draft and leaves Published unchanged", async () => {
    const initial = await service.getDraftDashboard(owner);
    const second = await service.saveDraft(owner, initial.revisionId, {
      ...toInput(initial),
      layout: { ...initial.layout, lg: [{ ...initial.layout.lg[0]!, x: 2 }] }
    });
    const third = await service.saveDraft(owner, second.revisionId, {
      ...toInput(second),
      layout: { ...second.layout, lg: [{ ...second.layout.lg[0]!, x: 4 }] }
    });
    const restored = await service.restoreRevision(owner, third.revisionId, initial.revisionId);

    expect(restored).toMatchObject({ revision: 4, revisionId: revisionId(4) });
    expect(restored.layout.lg[0]?.x).toBe(0);
    expect((await service.getPublishedDashboard()).revisionId).toBe(initial.revisionId);
    const restoredMetadata = await service.getRevision(owner, restored.revisionId);
    expect(restoredMetadata).toMatchObject({
      parentRevisionId: third.revisionId,
      restoredFromRevisionId: initial.revisionId
    });
    expect((await service.listRevisions(owner, { limit: 20 })).items.map(revisionNumber)).toEqual([
      4, 3, 2, 1
    ]);
  });
});

function toInput(value: DashboardSnapshot): DashboardDraftInput {
  return { layout: value.layout, widgets: value.widgets };
}

function toRevision(
  value: DashboardSnapshot,
  parentRevisionId: string | null,
  restoredFromRevisionId: string | null,
  operation: DashboardRevisionMetadata["operation"]
): DashboardRevisionSnapshot {
  return {
    createdAt: value.updatedAt,
    dashboardId: value.dashboardId,
    isCurrentDraft: value.state === "draft",
    isCurrentPublished: value.state === "published",
    layout: structuredClone(value.layout),
    operation,
    parentRevisionId,
    profile: structuredClone(value.profile),
    restoredFromRevisionId,
    revisionId: value.revisionId,
    revisionNumber: value.revision,
    widgets: structuredClone(value.widgets)
  };
}

function revisionId(revision: number) {
  return `00000000-0000-4000-8000-${String(revision).padStart(12, "0")}`;
}

function revisionNumber(metadata: DashboardRevisionMetadata) {
  return metadata.revisionNumber;
}
