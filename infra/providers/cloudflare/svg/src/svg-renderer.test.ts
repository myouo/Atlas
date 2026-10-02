import { describe, expect, it } from "vitest";

import { renderDashboardSvg, renderWidgetSvg } from "./svg-renderer";
import { dashboardFixture } from "./test-fixture";

describe("SVG card renderer", () => {
  it("includes every enabled published card and escapes Provider-controlled text", () => {
    const svg = renderDashboardSvg(dashboardFixture, "https://aboutme.example.test");

    expect(svg).toContain("Nivalis");
    expect(svg).toContain("Future &amp; &lt;Card&gt;");
    expect(svg).not.toContain("Hidden card");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<image");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("renders an unknown future Widget with a generic data card", () => {
    const future = {
      ...dashboardFixture.widgets[0]!,
      data: { listeningDays: 42, secretToken: "sensitive", account: { accessToken: 12345 } },
      title: "New Provider Widget",
      type: "future.provider.summary"
    };
    const svg = renderWidgetSvg(future, "https://aboutme.example.test");

    expect(svg).toContain("New Provider Widget");
    expect(svg).toContain("42");
    expect(svg).not.toContain("sensitive");
    expect(svg).not.toContain("secret Token");
    expect(svg).not.toContain("access Token");
  });

  it("keeps last known Steam metrics visible while marking stale data", () => {
    const svg = renderWidgetSvg(
      {
        ...dashboardFixture.widgets[0]!,
        data: { games: 42, playtimeHours: 128, achievements: 345 },
        stale: true,
        type: "steam.profile"
      },
      "https://aboutme.example.test"
    );
    expect(svg).toContain(">42</text>");
    expect(svg).toContain("数据待更新");
    expect(svg).toContain("2026-09-25 00:00 UTC");
  });

  it("removes XML control characters from provider text", () => {
    const svg = renderWidgetSvg(
      { ...dashboardFixture.widgets[0]!, title: "Title\u0000 & <unsafe>" },
      "https://aboutme.example.test"
    );
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.localName).toBe("svg");
    expect(svg).toContain("Title &amp; &lt;unsafe&gt;");
  });
});
