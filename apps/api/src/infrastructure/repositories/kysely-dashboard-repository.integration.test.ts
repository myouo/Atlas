import { randomUUID } from "node:crypto";

import { DashboardService } from "@nivalis/application";
import type { Clock } from "@nivalis/application";
import { RevisionConflictError } from "@nivalis/domain";
import type { DashboardDraftInput, OwnerContext, WidgetProjection } from "@nivalis/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMigrator } from "../database/migrator";
import { PHASE_THREE_INITIAL_REVISION_ID, PHASE_TWO_OWNER_ID } from "../database/phase-two-fixture";
import { seedPhaseFiveFixture } from "../database/seed";
import { createTestDatabase } from "../../testing/test-database";
import {
  KyselyDashboardRepository,
  KyselyDashboardUnitOfWork
} from "./kysely-dashboard-repository";

const database = createTestDatabase();
const repository = new KyselyDashboardRepository(database);
const unitOfWork = new KyselyDashboardUnitOfWork(database);
const fixedNow = new Date("2026-08-23T09:00:00.000Z");
const clock: Clock = { now: () => fixedNow };
const service = new DashboardService(repository, unitOfWork, clock);
const owner: OwnerContext = { actorId: PHASE_TWO_OWNER_ID };

beforeAll(async () => {
  const result = await createMigrator(database).migrateToLatest();
  if (result.error) throw result.error;
});

beforeEach(() => seedPhaseFiveFixture(database));
afterAll(() => database.destroy());

describe("Kysely immutable Dashboard revision repository", () => {
  it("Seeds one immutable revision referenced by both pointers", async () => {
    const [published, draft] = await Promise.all([
      repository.getCurrentBySlug("about", "published"),
      repository.getCurrentForOwner(PHASE_TWO_OWNER_ID, "about", "draft")
    ]);
    expect(published?.widgets).toHaveLength(10);
    expect(draft?.widgets).toHaveLength(10);
    expect(draft?.revisionId).toBe(PHASE_THREE_INITIAL_REVISION_ID);
    expect(published?.revisionId).toBe(draft?.revisionId);
  });

  it("creates a Draft revision while historical layout and Widget state remain immutable", async () => {
    const draft = await service.getDraftDashboard(owner);
    const changed: DashboardDraftInput = {
      layout: {
        ...draft.layout,
        lg: draft.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 2 } : item))
      },
      widgets: draft.widgets.map((widget, index) =>
        index === 0 ? { ...widget, dataConfig: { persisted: true } } : widget
      )
    };
    const saved = await service.saveDraft(owner, draft.revisionId, changed);

    expect(saved).toMatchObject({ revision: 2, state: "draft" });
    expect(saved.layout.lg[0]?.x).toBe(2);
    const historical = await service.getRevision(owner, draft.revisionId);
    expect(historical.layout.lg[0]?.x).toBe(0);
    expect(historical.widgets[0]?.dataConfig).toEqual({});
    await expect(
      database
        .updateTable("dashboard_revisions")
        .set({ operation: "save" })
        .where("id", "=", draft.revisionId)
        .execute()
    ).rejects.toThrow(/immutable/i);
    await expect(
      database
        .updateTable("dashboard_revision_widgets")
        .set({ title: "mutated" })
        .where("revision_id", "=", draft.revisionId)
        .execute()
    ).rejects.toThrow(/immutable/i);
  });

  it("keeps Public isolated until Publish moves only the pointer", async () => {
    const initial = await service.getDraftDashboard(owner);
    const second = await service.saveDraft(owner, initial.revisionId, moveProfile(initial, 1));
    const third = await service.saveDraft(owner, second.revisionId, moveProfile(second, 2));
    expect((await service.getPublishedDashboard()).revisionId).toBe(initial.revisionId);
    const historyBefore = await service.listRevisions(owner, { limit: 20 });

    const published = await service.publish(owner, third.revisionId);
    expect(published.revisionId).toBe(third.revisionId);
    expect((await service.getPublishedDashboard()).layout.lg[0]?.x).toBe(2);
    expect((await service.listRevisions(owner, { limit: 20 })).items).toHaveLength(
      historyBefore.items.length
    );
  });

  it("retains a deleted Widget in historical snapshots", async () => {
    const initial = await service.getDraftDashboard(owner);
    const widgetId = randomUUID();
    const added = await service.createWidget(owner, initial.revisionId, githubWidget(widgetId), {
      lg: { h: 3, i: widgetId, w: 4, x: 0, y: 14 },
      md: { h: 3, i: widgetId, w: 3, x: 0, y: 14 },
      sm: { h: 4, i: widgetId, w: 4, x: 0, y: 36 }
    });
    const deleted = await service.deleteWidget(owner, added.revisionId, widgetId);

    expect(deleted.widgets.some((widget) => widget.id === widgetId)).toBe(false);
    expect(
      (await service.getRevision(owner, added.revisionId)).widgets.some(
        (widget) => widget.id === widgetId
      )
    ).toBe(true);
    expect(
      await database
        .selectFrom("widgets")
        .select("id")
        .where("id", "=", widgetId)
        .executeTakeFirst()
    ).toBeTruthy();
  });

  it("restores history by cloning a new Draft with provenance", async () => {
    const initial = await service.getDraftDashboard(owner);
    const second = await service.saveDraft(owner, initial.revisionId, moveProfile(initial, 1));
    const third = await service.saveDraft(owner, second.revisionId, moveProfile(second, 2));
    await service.publish(owner, third.revisionId);
    const restored = await service.restoreRevision(owner, third.revisionId, initial.revisionId);
    const detail = await service.getRevision(owner, restored.revisionId);

    expect(restored).toMatchObject({ revision: 4, state: "draft" });
    expect(restored.layout).toEqual(initial.layout);
    expect(detail).toMatchObject({
      parentRevisionId: third.revisionId,
      restoredFromRevisionId: initial.revisionId
    });
    expect((await service.getPublishedDashboard()).revisionId).toBe(third.revisionId);
    expect((await service.listRevisions(owner, { limit: 20 })).items.map(revisionNumber)).toEqual([
      4, 3, 2, 1
    ]);
  });

  it("paginates newest-first revision metadata", async () => {
    const initial = await service.getDraftDashboard(owner);
    const second = await service.saveDraft(owner, initial.revisionId, moveProfile(initial, 1));
    await service.saveDraft(owner, second.revisionId, moveProfile(second, 2));

    const firstPage = await service.listRevisions(owner, { limit: 2 });
    expect(firstPage.items.map(revisionNumber)).toEqual([3, 2]);
    expect(firstPage.nextCursorRevisionNumber).toBe(2);
    const secondPage = await service.listRevisions(owner, {
      beforeRevisionNumber: firstPage.nextCursorRevisionNumber!,
      limit: 2
    });
    expect(secondPage.items.map(revisionNumber)).toEqual([1]);
    expect(secondPage.nextCursorRevisionNumber).toBeNull();
  });

  it("allows exactly one of two concurrent saves from the same expected revision", async () => {
    const initial = await service.getDraftDashboard(owner);
    const [left, right] = await Promise.allSettled([
      service.saveDraft(owner, initial.revisionId, moveProfile(initial, 1)),
      service.saveDraft(owner, initial.revisionId, moveProfile(initial, 2))
    ]);
    const outcomes = [left, right];
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(RevisionConflictError) });
    expect((await service.listRevisions(owner, { limit: 20 })).items.map(revisionNumber)).toEqual([
      2, 1
    ]);
  });

  it("rolls back pointer, revision, and revision number allocation together", async () => {
    const initial = await service.getDraftDashboard(owner);
    await expect(
      unitOfWork.run(async (transactionalRepository) => {
        const result = await transactionalRepository.createDraftRevisionForOwner(
          PHASE_TWO_OWNER_ID,
          "about",
          {
            expectedRevisionId: initial.revisionId,
            input: moveProfile(initial, 1),
            now: fixedNow,
            operation: "save"
          }
        );
        expect(result.kind).toBe("success");
        throw new Error("force rollback");
      })
    ).rejects.toThrow("force rollback");
    expect((await service.getDraftDashboard(owner)).revisionId).toBe(initial.revisionId);
    expect((await service.listRevisions(owner, { limit: 20 })).items.map(revisionNumber)).toEqual([
      1
    ]);
  });

  it("keeps the Phase 5 development Seed idempotent without appending history", async () => {
    const initial = await service.getDraftDashboard(owner);
    await service.saveDraft(owner, initial.revisionId, moveProfile(initial, 1));
    await seedPhaseFiveFixture(database);
    await seedPhaseFiveFixture(database);
    const counts = await Promise.all([
      count("profiles"),
      count("dashboards"),
      count("dashboard_revisions"),
      count("widgets"),
      count("dashboard_revision_widgets")
    ]);
    expect(counts).toEqual([1, 1, 1, 10, 10]);
    const [draft, published] = await Promise.all([
      service.getDraftDashboard(owner),
      service.getPublishedDashboard()
    ]);
    expect(draft.revisionId).toBe(PHASE_THREE_INITIAL_REVISION_ID);
    expect(published.revisionId).toBe(draft.revisionId);
  });
});

function moveProfile(
  dashboard: Awaited<ReturnType<DashboardService["getDraftDashboard"]>>,
  x: number
): DashboardDraftInput {
  return {
    layout: {
      ...dashboard.layout,
      lg: dashboard.layout.lg.map((item, index) => (index === 0 ? { ...item, x } : item))
    },
    widgets: dashboard.widgets
  };
}

function githubWidget(id: string): WidgetProjection {
  return {
    dataConfig: {},
    data: { handle: "@fixture", repositories: 1, stars: 2, followers: 3, contributions: 4 },
    enabled: true,
    id,
    presentationConfig: {},
    provider: "fixture",
    schemaVersion: 1,
    stale: false,
    title: "GitHub Fixture",
    type: "github.profile",
    updatedAt: fixedNow
  };
}

function revisionNumber(revision: { readonly revisionNumber: number }) {
  return revision.revisionNumber;
}

async function count(table: keyof import("../database/schema").Database) {
  const row = await database
    .selectFrom(table)
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
