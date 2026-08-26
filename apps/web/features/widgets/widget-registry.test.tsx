import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WidgetProjection } from "@nivalis/api-client";
import { type ReactElement, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockWidget, mockWidgets } from "../dashboard/mock-dashboard";
import { dashboardSource } from "../../api/dashboard-source-factory";
import { WidgetCard } from "./widget-card";
import { WidgetRegistry, widgetRegistry } from "./widget-registry";

describe("WidgetRegistry", () => {
  it("resolves renderers by type + schemaVersion", () => {
    expect(widgetRegistry.resolve("music.netease.overview", 1)?.name).toBe("网易云音乐");
    expect(widgetRegistry.resolve("music.netease.overview", 2)?.name).toBe("网易云音乐");
    expect(widgetRegistry.resolve("music.netease.identity", 1)?.name).toBe("网易云 · 身份档案");
    expect(widgetRegistry.preferred("music.netease.overview")?.schemaVersion).toBe(2);
    expect(widgetRegistry.preferred("music.netease.ranking")?.schemaVersion).toBe(2);
    expect(widgetRegistry.preferred("music.netease.showcase")?.schemaVersion).toBe(2);
    expect(widgetRegistry.list()).toHaveLength(12);
    expect(widgetRegistry.list().some((item) => item.type === "music.netease.social")).toBe(false);
  });

  it("rejects duplicate registrations", () => {
    const registry = new WidgetRegistry();
    const definition = widgetRegistry.resolve("github.profile", 1);
    expect(definition).toBeDefined();
    registry.register(definition!);
    expect(() => registry.register(definition!)).toThrow(/already registered/);
  });

  it("renders a graceful fallback for an unknown runtime Widget", () => {
    renderWidget(
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

  it("keeps card headers concise without a secondary subtitle", () => {
    const github = mockWidgets.find((widget) => widget.type === "github.profile");
    expect(github).toBeDefined();
    const { container } = renderWidget(
      <WidgetCard editable={false} onRemove={() => undefined} widget={github!} />
    );
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    expect(container.querySelector(".module-shell-subtitle")).toBeNull();
    expect(screen.queryByText(/Fixture · @nivalis/)).not.toBeInTheDocument();
  });

  it("edits display fields through Registry-driven presentation controls", async () => {
    const netease = createMockWidget(
      "music.netease.overview",
      "00000000-0000-4000-8000-000000001006",
      2
    );
    const onPresentationConfigChange = vi.fn();
    renderWidget(
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

  it("applies semantic public-data presets without exposing raw Provider fields", async () => {
    const identity = createMockWidget(
      "music.netease.identity",
      "00000000-0000-4000-8000-000000001007"
    );
    const onDataConfigChange = vi.fn();
    renderWidget(
      <WidgetCard
        editable
        onDataConfigChange={onDataConfigChange}
        onRemove={() => undefined}
        widget={identity}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /设置 网易云 · 身份档案/ }));
    await userEvent.click(screen.getByRole("button", { name: /完整公开档案/ }));
    expect(onDataConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        medalLimit: 8,
        publicFields: expect.arrayContaining(["signature", "provider_user_id"])
      })
    );
  });

  it("adds an exact resource to the six-item showcase gallery", async () => {
    const showcase = createMockWidget(
      "music.netease.showcase",
      "00000000-0000-4000-8000-000000001008",
      2
    );
    const onDataConfigChange = vi.fn();
    const catalogSpy = vi.spyOn(dashboardSource, "getNeteaseDataCatalog");
    renderWidget(<StatefulWidgetCard initial={showcase} onDataConfigChange={onDataConfigChange} />);

    expect(catalogSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /设置 网易云 · 音乐展柜/ }));
    await waitFor(() => expect(catalogSpy).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "跟随网易云主页" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await userEvent.click(screen.getByRole("button", { name: "Nivalis 自定义" }));
    await userEvent.click(await screen.findByRole("button", { name: /累计播放时间/ }));
    expect(onDataConfigChange).toHaveBeenLastCalledWith({
      mode: "custom",
      selections: [{ resourceId: "total", source: "listening_duration" }]
    });
    catalogSpy.mockRestore();
  });
});

function StatefulWidgetCard({
  initial,
  onDataConfigChange
}: {
  readonly initial: WidgetProjection;
  readonly onDataConfigChange: (config: WidgetProjection["dataConfig"]) => void;
}) {
  const [widget, setWidget] = useState(initial);
  return (
    <WidgetCard
      editable
      onDataConfigChange={(config) => {
        onDataConfigChange(config);
        setWidget({ ...widget, dataConfig: config } as WidgetProjection);
      }}
      onRemove={() => undefined}
      widget={widget}
    />
  );
}

function renderWidget(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
