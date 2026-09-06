import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WidgetProjection } from "@nivalis/api-client";
import { type ReactElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockWidget, mockWidgets } from "../dashboard/mock-dashboard";
import { dashboardSource } from "../../api/dashboard-source-factory";
import { WidgetCard } from "./widget-card";
import { WidgetRegistry, widgetRegistry } from "./widget-registry";
import { AddWidgetDialog } from "../dashboard/add-widget-dialog";
import { ModuleCatalog } from "../dashboard/module-catalog";

afterEach(cleanup);

describe("WidgetRegistry", () => {
  it("resolves renderers by type + schemaVersion", () => {
    expect(widgetRegistry.resolve("music.netease.overview", 1)?.name).toBe("网易云音乐");
    expect(widgetRegistry.resolve("music.netease.overview", 2)?.name).toBe("网易云音乐");
    expect(widgetRegistry.resolve("music.netease.identity", 1)?.name).toBe("网易云 · 身份档案");
    expect(widgetRegistry.preferred("music.netease.overview")?.schemaVersion).toBe(2);
    expect(widgetRegistry.preferred("music.netease.ranking")?.schemaVersion).toBe(2);
    expect(widgetRegistry.preferred("music.netease.showcase")?.schemaVersion).toBe(2);
    expect(widgetRegistry.list()).toHaveLength(9);
    expect(widgetRegistry.preferred("music.netease.calendar")?.schemaVersion).toBe(1);
    expect(widgetRegistry.list().some((item) => item.type === "music.netease.social")).toBe(false);
  });

  it("only exposes implemented modules in both creation surfaces", () => {
    expect(widgetRegistry.list().every((definition) => definition.implementation === "ready")).toBe(
      true
    );
    for (const type of [
      "github.profile",
      "bilibili.profile",
      "bangumi.collection",
      "system.stats"
    ] as const) {
      expect(widgetRegistry.preferred(type)).toBeUndefined();
      expect(widgetRegistry.resolve(type, 1)).toBeDefined();
    }
    expect(widgetRegistry.preferred("steam.profile")?.schemaVersion).toBe(2);
    render(
      <>
        <ModuleCatalog onAdd={vi.fn()} onOpenCatalog={vi.fn()} widgets={[]} />
        <AddWidgetDialog onAdd={vi.fn()} onOpenChange={vi.fn()} open widgets={[]} />
      </>
    );
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByText("Bilibili")).not.toBeInTheDocument();
    expect(screen.queryByText("Bangumi")).not.toBeInTheDocument();
    expect(screen.queryByText("统计信息")).not.toBeInTheDocument();
    expect(screen.getAllByText("Steam").length).toBeGreaterThan(0);
  });

  it("defaults new registrations to unavailable for creation until explicitly ready", () => {
    const registry = new WidgetRegistry();
    registry.register(widgetRegistry.resolve("github.profile", 1)!);
    expect(registry.list()).toEqual([]);
    expect(registry.resolve("github.profile", 1)).toBeDefined();
  });

  it.each([{}, { games: 3 }, { games: 3, playtimeHours: null }, null])(
    "shows a card placeholder for missing legacy Steam data instead of crashing: %j",
    (data) => {
      const steam = mockWidgets.find((widget) => widget.type === "steam.profile")!;
      const github = mockWidgets.find((widget) => widget.type === "github.profile")!;
      renderWidget(
        <>
          <WidgetCard editable onRemove={vi.fn()} widget={{ ...steam, data }} />
          <WidgetCard editable={false} onRemove={vi.fn()} widget={github} />
        </>
      );
      expect(screen.getByText("尚无可展示的数据")).toBeInTheDocument();
      expect(screen.getByText(/这是旧版 Steam 示例卡片/)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    }
  );

  it("isolates malformed card render failures and recovers after a new data version", () => {
    const steam = createMockWidget("steam.profile", "steam-recovery", 2);
    const github = mockWidgets.find((widget) => widget.type === "github.profile")!;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const view = renderWidget(
        <>
          <WidgetCard
            editable={false}
            onRemove={vi.fn()}
            widget={{ ...steam, data: { provider: "steam" } }}
          />
          <WidgetCard editable={false} onRemove={vi.fn()} widget={github} />
        </>
      );
      expect(screen.getByText("此模块暂时无法显示")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
      expect(screen.queryByText(/TypeError|Cannot read properties/)).not.toBeInTheDocument();
      view.rerender(
        <WidgetCard
          editable={false}
          onRemove={vi.fn()}
          widget={{ ...steam, updatedAt: "2026-09-06T02:00:00.000Z" }}
        />
      );
      expect(screen.queryByText("此模块暂时无法显示")).not.toBeInTheDocument();
      expect(screen.getAllByText("尚未同步 Steam 数据").length).toBeGreaterThan(0);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("rejects duplicate registrations", () => {
    const registry = new WidgetRegistry();
    const definition = widgetRegistry.resolve("github.profile", 1);
    expect(definition).toBeDefined();
    registry.register(definition!);
    expect(() => registry.register(definition!)).toThrow(/already registered/);
  });
  it("links Steam card settings to the account input form", async () => {
    renderWidget(
      <WidgetCard
        editable
        onRemove={vi.fn()}
        widget={createMockWidget("steam.profile", "steam-settings-link", 2)}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /设置 Steam 展示字段/ }));
    expect(screen.getByRole("link", { name: /绑定或更换 Steam 账号/ })).toHaveAttribute(
      "href",
      "/settings#steam"
    );
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
