import { beforeEach, describe, expect, it } from "vitest";

import { useDashboardStore } from "./dashboard-store";
import { mockDashboard } from "./mock-dashboard";

describe("local Draft / Published lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    useDashboardStore.setState({
      dirty: false,
      draft: null,
      initialized: false,
      lastPublishedAt: null,
      lastSavedAt: null,
      manualOverrides: { lg: false, md: false, sm: false },
      mode: "display",
      published: null
    });
  });

  it("keeps a manual draft layout isolated until explicit publish", () => {
    const actions = useDashboardStore.getState();
    actions.initialize(mockDashboard);
    const before = useDashboardStore.getState().published!.layout.lg[0];
    const changed = useDashboardStore
      .getState()
      .draft!.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 3 } : item));

    useDashboardStore.getState().updateBreakpointLayout("lg", changed);
    expect(useDashboardStore.getState().draft!.layout.lg[0]?.x).toBe(3);
    expect(useDashboardStore.getState().published!.layout.lg[0]).toEqual(before);

    useDashboardStore.getState().saveDraft();
    expect(useDashboardStore.getState().published!.layout.lg[0]).toEqual(before);

    useDashboardStore.getState().publishDraft();
    expect(useDashboardStore.getState().published!.layout.lg[0]?.x).toBe(3);
    expect(useDashboardStore.getState().published!.revision).toBe(mockDashboard.revision + 1);
  });

  it("resets the draft from the Published snapshot", () => {
    useDashboardStore.getState().initialize(mockDashboard);
    useDashboardStore.getState().removeWidget("github-profile");
    expect(
      useDashboardStore.getState().draft!.widgets.some((widget) => widget.id === "github-profile")
    ).toBe(false);
    useDashboardStore.getState().resetDraft();
    expect(
      useDashboardStore.getState().draft!.widgets.some((widget) => widget.id === "github-profile")
    ).toBe(true);
  });
});
