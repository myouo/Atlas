import { describe, expect, it } from "vitest";

import { mockLayout, mockWidgets } from "./mock-dashboard";
import {
  addWidgetToLayouts,
  compactLayout,
  createSmartLayout,
  findFirstGap,
  removeWidgetFromLayouts,
  stripUnknownLayoutItems
} from "./layout-engine";
import { widgetRegistry } from "../widgets/widget-registry";

describe("layout engine", () => {
  it("creates the documented 1, 2, and 3 module smart defaults", () => {
    expect(createSmartLayout(["a"], "lg")).toEqual([{ i: "a", x: 0, y: 0, w: 12, h: 3 }]);
    expect(createSmartLayout(["a", "b"], "lg").map((item) => item.w)).toEqual([6, 6]);
    expect(createSmartLayout(["a", "b", "c"], "lg").map((item) => item.w)).toEqual([6, 3, 3]);
  });

  it("finds the first non-overlapping position", () => {
    expect(findFirstGap([{ i: "a", x: 0, y: 0, w: 6, h: 3 }], 6, 3, 12)).toEqual({ x: 6, y: 0 });
  });

  it("adds the same Widget definition as a distinct instance at every breakpoint", () => {
    const definition = widgetRegistry.resolve("github.profile", 1);
    expect(definition).toBeDefined();
    const next = addWidgetToLayouts(mockLayout, "github-second", definition!.sizes);
    expect(next.lg.some((item) => item.i === "github-second")).toBe(true);
    expect(next.md.some((item) => item.i === "github-second")).toBe(true);
    expect(next.sm.some((item) => item.i === "github-second")).toBe(true);
  });

  it("removes and compacts instances without mutating the original layout", () => {
    const next = removeWidgetFromLayouts(mockLayout, "stat-uptime");
    expect(next.lg.some((item) => item.i === "stat-uptime")).toBe(false);
    expect(mockLayout.lg.some((item) => item.i === "stat-uptime")).toBe(true);
    expect(compactLayout([{ i: "a", x: 0, y: 5, w: 3, h: 2 }])[0]?.y).toBe(0);
  });

  it("drops layout entries that have no Widget instance", () => {
    const withUnknown = {
      ...mockLayout,
      lg: [...mockLayout.lg, { i: "ghost", x: 0, y: 30, w: 2, h: 2 }]
    };
    const result = stripUnknownLayoutItems(withUnknown, mockWidgets);
    expect(result.lg.some((item) => item.i === "ghost")).toBe(false);
  });
});
