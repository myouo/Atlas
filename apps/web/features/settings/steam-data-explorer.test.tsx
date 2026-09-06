import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SteamDataCatalog } from "@nivalis/api-client";
import { SteamCatalogView, SteamDataExplorer } from "./steam-data-explorer";

const source = vi.hoisted(() => ({ kind: "api", getSteamDataCatalog: vi.fn() }));
vi.mock("../../api/dashboard-source-factory", () => ({ dashboardSource: source }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const value: SteamDataCatalog = {
  provider: "steam",
  schemaVersion: 2,
  dataVersion: "00000000-0000-4000-8000-000000000012",
  generatedAt: "2026-09-06T00:00:00.000Z",
  catalog: {
    library: {
      availability: "available",
      gameCount: 35,
      unplayedGameCount: 0,
      playtimeMinutes: null,
      playtimeCoverage: { knownMinutes: 500, knownGameCount: 34, unknownGameCount: 1 },
      games: Array.from({ length: 35 }, (_, index) => ({
        appId: index + 1,
        name: `Library game ${index + 1}`
      }))
    },
    recentGames: {
      availability: "available",
      totalCount: 1,
      items: [{ appId: 1, name: "Recent game" }]
    },
    coverage: {
      library: { status: "complete", collectedCount: 35, reportedCount: 35 },
      achievements: { status: "partial", collectedCount: 8, reportedCount: 35 },
      inventory: { status: "not_collected" },
      wishlist: { status: "not_collected" }
    },
    achievements: { requestBudget: 8, games: [] }
  }
};
describe("Steam Owner data explorer", () => {
  it("paginates the full library, searches beyond the first page and separates partial coverage", async () => {
    render(<SteamCatalogView value={value} />);
    const list = screen.getByRole("list", { name: "Steam 游戏明细" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(30);
    expect(screen.queryByText("Library game 35")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    await userEvent.type(
      screen.getByRole("textbox", { name: "搜索 Steam 游戏" }),
      "Library game 35"
    );
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByText(/部分覆盖 · 8\/35/)).toBeInTheDocument();
    expect(screen.getByText(/累计游玩 未公开/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出完整 JSON" })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("textbox", { name: "搜索 Steam 游戏" }));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Steam 数据集合" }),
      "recentGames"
    );
    await screen.findByText("Recent game", { exact: false });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });
  it("loads the private full catalog only when the Owner opens it", async () => {
    source.getSteamDataCatalog.mockResolvedValue(value);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <SteamDataExplorer enabled />
      </QueryClientProvider>
    );
    expect(source.getSteamDataCatalog).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "查看完整 Steam 数据" }));
    await screen.findByRole("region", { name: "Steam 完整数据目录" });
    expect(source.getSteamDataCatalog).toHaveBeenCalledOnce();
    view.unmount();
    client.clear();
  });
  it("does not describe an old limited snapshot as complete", () => {
    render(
      <SteamCatalogView
        value={{ ...value, schemaVersion: 1, catalog: { library: value.catalog.library } }}
      />
    );
    expect(screen.getAllByText("旧快照，请重新同步")).toHaveLength(6);
    expect(screen.queryByText(/接口返回完整 ·/)).not.toBeInTheDocument();
  });
});
