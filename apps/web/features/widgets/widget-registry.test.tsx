import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createMockWidget, mockWidgets } from "../dashboard/mock-dashboard";
import { WidgetCard } from "./widget-card";
import { WidgetRegistry, widgetRegistry } from "./widget-registry";

describe("WidgetRegistry", () => {
  it("resolves renderers by type + schemaVersion", () => {
    expect(widgetRegistry.resolve("music.netease.overview", 1)?.name).toBe("网易云音乐");
    expect(widgetRegistry.resolve("music.netease.overview", 2)?.name).toBe("网易云音乐");
    expect(widgetRegistry.preferred("music.netease.overview")?.schemaVersion).toBe(2);
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

  it("labels unconnected Provider projections as Fixture", () => {
    const github = mockWidgets.find((widget) => widget.type === "github.profile");
    expect(github).toBeDefined();
    render(<WidgetCard editable={false} onRemove={() => undefined} widget={github!} />);
    expect(screen.getByText(/Fixture · @nivalis/)).toBeInTheDocument();
  });

  it("edits display fields through Registry-driven presentation controls", async () => {
    const netease = createMockWidget(
      "music.netease.overview",
      "00000000-0000-4000-8000-000000001006",
      2
    );
    const onPresentationConfigChange = vi.fn();
    render(
      <WidgetCard
        editable
        onPresentationConfigChange={onPresentationConfigChange}
        onRemove={() => undefined}
        widget={netease}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /设置 网易云音乐.*展示字段/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Top Artists/ }));
    expect(onPresentationConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ showArtists: false })
    );
  });
});
