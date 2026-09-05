import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockWidget } from "../../dashboard/mock-dashboard";
import type { WidgetOf } from "../widget-types";
import { SteamProfileWidget } from "./steam-profile-widget";

afterEach(cleanup);
const base = createMockWidget("steam.profile", "steam-test", 2) as Extract<
  WidgetOf<"steam.profile">,
  { schemaVersion: 2 }
>;
describe("Steam card", () => {
  it("starts honestly unsynchronized rather than showing fixture stats", () => {
    render(<SteamProfileWidget widget={base} />);
    expect(screen.getAllByText("尚未同步 Steam 数据").length).toBeGreaterThan(0);
    expect(screen.queryByText("游戏库")).not.toBeInTheDocument();
  });
  it("distinguishes a known zero library from hidden playtime", () => {
    const { rerender } = render(
      <SteamProfileWidget
        widget={{
          ...base,
          data: {
            ...base.data,
            library: {
              availability: "available",
              gameCount: 0,
              playtimeMinutes: 0,
              playedGameCount: 0
            },
            recentGames: { availability: "available", totalCount: 0, items: [] }
          }
        }}
      />
    );
    expect(screen.getByText("0 小时")).toBeInTheDocument();
    expect(screen.getByText("最近两周没有游玩记录")).toBeInTheDocument();
    rerender(
      <SteamProfileWidget
        widget={{
          ...base,
          data: {
            ...base.data,
            library: {
              availability: "available",
              gameCount: 2,
              playtimeMinutes: null,
              playedGameCount: null
            }
          }
        }}
      />
    );
    expect(screen.getByText("未公开")).toBeInTheDocument();
    expect(screen.queryByText("0 小时")).not.toBeInTheDocument();
  });
});
