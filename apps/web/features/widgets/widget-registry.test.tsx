import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WidgetCard } from "./widget-card";
import { WidgetRegistry, widgetRegistry } from "./widget-registry";

describe("WidgetRegistry", () => {
  it("resolves renderers by type + schemaVersion", () => {
    expect(widgetRegistry.resolve("music.netease.overview", 1)?.name).toBe("网易云音乐");
    expect(widgetRegistry.resolve("music.netease.overview", 2)).toBeUndefined();
    expect(widgetRegistry.list()).toHaveLength(7);
  });

  it("rejects duplicate registrations", () => {
    const registry = new WidgetRegistry();
    const definition = widgetRegistry.resolve("github.profile", 1);
    expect(definition).toBeDefined();
    registry.register(definition!);
    expect(() => registry.register(definition!)).toThrow(/already registered/);
  });

  it("renders a graceful fallback for an unknown runtime Widget", () => {
    render(
      <WidgetCard
        editable={false}
        onRemove={() => undefined}
        widget={{
          data: {},
          id: "future-widget",
          schemaVersion: 4,
          stale: false,
          title: "Future",
          type: "future.timeline",
          updatedAt: "2026-08-23T00:00:00Z"
        }}
      />
    );
    expect(screen.getByText("暂不支持的模块")).toBeInTheDocument();
    expect(screen.getByText(/其它模块仍可正常显示/)).toBeInTheDocument();
  });
});
