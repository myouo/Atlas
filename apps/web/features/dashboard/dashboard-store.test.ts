import { beforeEach, describe, expect, it } from "vitest";

import { useDashboardStore } from "./dashboard-store";
import { mockDashboard } from "./mock-dashboard";

const mockDraft = {
  ...mockDashboard,
  revisionId: "00000000-0000-4000-8000-000000000301",
  state: "draft" as const,
  updatedAt: "2026-08-23T04:30:00.000Z"
};

describe("local Draft / Published lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    useDashboardStore.setState({
      concurrencyToken: null,
      conflict: null,
      dirty: false,
      draft: null,
      initialized: false,
      lastPublishedAt: null,
      lastSavedAt: null,
      manualOverrides: { lg: false, md: false, sm: false },
      mode: "display",
      published: null,
      sourceKind: null
    });
  });

  it("keeps a manual draft layout isolated until explicit publish", () => {
    useDashboardStore.getState().initializeLocal(mockDashboard, mockDraft, "mock:rev:1");
    const before = useDashboardStore.getState().published!.layout.lg[0];
    const changed = useDashboardStore
      .getState()
      .draft!.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 3 } : item));

    useDashboardStore.getState().updateBreakpointLayout("lg", changed);
    expect(useDashboardStore.getState().draft!.layout.lg[0]?.x).toBe(3);
    expect(useDashboardStore.getState().published!.layout.lg[0]).toEqual(before);

    useDashboardStore.getState().acceptSavedDraft(
      {
        ...mockDraft,
        layout: useDashboardStore.getState().draft!.layout,
        revision: mockDraft.revision + 1
      },
      "mock:rev:2"
    );
    expect(useDashboardStore.getState().published!.layout.lg[0]).toEqual(before);

    useDashboardStore.getState().acceptPublished(
      {
        ...mockDraft,
        layout: useDashboardStore.getState().draft!.layout,
        revision: mockDashboard.revision + 1,
        state: "published"
      },
      "mock:rev:2"
    );
    expect(useDashboardStore.getState().published!.layout.lg[0]?.x).toBe(3);
    expect(useDashboardStore.getState().published!.revision).toBe(mockDashboard.revision + 1);
  });

  it("resets the draft from the Published snapshot", () => {
    useDashboardStore.getState().initializeLocal(mockDashboard, mockDraft, "mock:rev:1");
    useDashboardStore.getState().removeWidget("github-profile");
    expect(
      useDashboardStore.getState().draft!.widgets.some((widget) => widget.id === "github-profile")
    ).toBe(false);
    useDashboardStore.getState().resetDraft();
    expect(
      useDashboardStore.getState().draft!.widgets.some((widget) => widget.id === "github-profile")
    ).toBe(true);
  });

  it("replaces cached state from the API composition boundary", () => {
    useDashboardStore.getState().initializeLocal(mockDashboard, mockDraft, "mock:rev:1");
    const remoteDraft = {
      ...mockDraft,
      layout: {
        ...mockDraft.layout,
        lg: mockDraft.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 2 } : item))
      }
    };
    useDashboardStore.getState().replaceFromRemote(mockDashboard, remoteDraft, '"rev:remote"');
    expect(useDashboardStore.getState().sourceKind).toBe("api");
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(2);
  });

  it("preserves local edits and the old token when a concurrency conflict is recorded", () => {
    useDashboardStore.getState().initializeLocal(mockDashboard, mockDraft, '"rev:one"');
    const changed = mockDraft.layout.lg.map((item, index) =>
      index === 0 ? { ...item, x: 2 } : item
    );
    useDashboardStore.getState().updateBreakpointLayout("lg", changed);
    useDashboardStore.getState().recordConflict({
      currentConcurrencyToken: '"rev:two"',
      currentRevisionId: "00000000-0000-4000-8000-000000000302",
      currentRevisionNumber: 2
    });

    expect(useDashboardStore.getState().dirty).toBe(true);
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(2);
    expect(useDashboardStore.getState().concurrencyToken).toBe('"rev:one"');
  });

  it("does not replace a dirty API Draft until the user explicitly forces reload", () => {
    useDashboardStore.getState().replaceFromRemote(mockDashboard, mockDraft, '"rev:one"');
    useDashboardStore
      .getState()
      .updateBreakpointLayout("lg", [
        { ...mockDraft.layout.lg[0]!, x: 2 },
        ...mockDraft.layout.lg.slice(1)
      ]);
    useDashboardStore.getState().replaceFromRemote(mockDashboard, mockDraft, '"rev:two"');
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(2);
    expect(useDashboardStore.getState().concurrencyToken).toBe('"rev:one"');

    useDashboardStore.getState().replaceFromRemote(mockDashboard, mockDraft, '"rev:two"', true);
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(0);
    expect(useDashboardStore.getState().concurrencyToken).toBe('"rev:two"');
  });

  it("refreshes Projection data without changing dirty layout or revision token", () => {
    useDashboardStore.getState().replaceFromRemote(mockDashboard, mockDraft, '"rev:one"');
    useDashboardStore
      .getState()
      .updateBreakpointLayout("lg", [
        { ...mockDraft.layout.lg[0]!, x: 2 },
        ...mockDraft.layout.lg.slice(1)
      ]);
    const refreshedWidgets = mockDashboard.widgets.map((widget) =>
      widget.type === "music.netease.overview"
        ? { ...widget, data: { ...widget.data, plays: 267 } }
        : widget
    ) as typeof mockDashboard.widgets;
    useDashboardStore
      .getState()
      .acceptProjectionRefresh({ ...mockDashboard, widgets: refreshedWidgets }, refreshedWidgets);

    const state = useDashboardStore.getState();
    const netease = state.draft?.widgets.find((widget) => widget.type === "music.netease.overview");
    expect(state.dirty).toBe(true);
    expect(state.draft?.layout.lg[0]?.x).toBe(2);
    expect(state.concurrencyToken).toBe('"rev:one"');
    expect(netease?.data).toMatchObject({ plays: 267 });
  });
});
