import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockDashboard } from "../../dashboard/mock-dashboard";
import type { WidgetOf } from "../widget-types";
import { NeteaseOverviewWidget } from "./netease-overview-widget";

describe("NeteaseOverviewWidget", () => {
  it("uses lightweight native charts without Recharts layout observers", () => {
    const widget = mockDashboard.widgets.find(
      (candidate) => candidate.type === "music.netease.overview" && candidate.schemaVersion === 1
    ) as WidgetOf<"music.netease.overview">;
    const { container } = render(<NeteaseOverviewWidget widget={widget} />);

    expect(screen.getByRole("img", { name: /音乐类型占比/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "7 天收听趋势" })).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).toBeNull();
  });
});
