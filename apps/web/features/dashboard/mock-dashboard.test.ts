import { describe, expect, it } from "vitest";

import { mockDashboardSource } from "../../api/mock-dashboard-source";
import { widgetRegistry } from "../widgets/widget-registry";
import { mockDashboard } from "./mock-dashboard";

describe("Phase 1 Dashboard Read Model", () => {
  it("maps every contracted Widget projection to a registered renderer", () => {
    for (const widget of mockDashboard.widgets) {
      expect(widgetRegistry.resolve(widget.type, widget.schemaVersion)).toBeDefined();
    }
  });

  it("proves Definition and Instance are separate with four system.stats instances", () => {
    const stats = mockDashboard.widgets.filter((widget) => widget.type === "system.stats");
    expect(stats).toHaveLength(4);
    expect(new Set(stats.map((widget) => widget.id)).size).toBe(4);
  });

  it("keeps every breakpoint layout aligned to actual Widget instances", () => {
    const widgetIds = new Set(mockDashboard.widgets.map((widget) => widget.id));
    for (const layout of Object.values(mockDashboard.layout)) {
      expect(layout.every((item) => widgetIds.has(item.i))).toBe(true);
    }
  });

  it("returns an isolated clone through the data-source boundary", async () => {
    const first = await mockDashboardSource.getPublicAboutDashboard();
    const second = await mockDashboardSource.getPublicAboutDashboard();
    first.widgets.splice(0, 1);
    expect(second.widgets).toHaveLength(mockDashboard.widgets.length);
  });
});
