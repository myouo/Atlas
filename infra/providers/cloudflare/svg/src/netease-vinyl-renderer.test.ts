import { describe, expect, it } from "vitest";

import {
  renderDashboardSvg,
  renderNeteaseSvg,
  renderWidgetSvg,
  type PublishedWidget
} from "./svg-renderer";
import { dashboardFixture } from "./test-fixture";

const ranking: PublishedWidget = {
  ...dashboardFixture.widgets[0]!,
  type: "music.netease.ranking",
  schemaVersion: 2,
  title: "听歌双榜",
  data: {
    publicRanges: ["week", "all_time"],
    week: {
      availability: "available",
      items: [{ playCount: 12, track: { name: "Week & <Song>", artists: [{ name: "Artist" }] } }]
    },
    all_time: {
      availability: "available",
      items: [{ playCount: 99, track: { name: "All-time Song", artists: [] } }]
    }
  }
};

describe("NetEase vinyl SVG style", () => {
  it("uses a distinct layout and preserves range selection, escaping and cache content", () => {
    const site = "https://aboutme.example.test";
    const soft = renderWidgetSvg(ranking, site);
    const vinyl = renderWidgetSvg(ranking, site, new URLSearchParams("style=vinyl"));
    const allTime = renderWidgetSvg(
      ranking,
      site,
      new URLSearchParams("style=vinyl&range=all_time")
    );
    expect(vinyl).toContain("ON REPEAT");
    expect(vinyl).toContain("#15161b");
    expect(vinyl).toContain("Week &amp; &lt;Song&gt;");
    expect(vinyl).not.toContain("All-time Song");
    expect(allTime).toContain("All-time Song");
    expect(allTime).not.toContain("Week &amp;");
    expect(vinyl).not.toEqual(soft);
    expect(
      new DOMParser().parseFromString(vinyl, "image/svg+xml").querySelector("parsererror")
    ).toBeNull();
  });

  it("does not show private ranges or disabled and unrelated Widgets in the collection", () => {
    const widgets = [
      { ...ranking, data: { ...(ranking.data as object), publicRanges: ["week"] } },
      { ...ranking, id: "private", enabled: false, title: "Private card" },
      ...dashboardFixture.widgets
    ];
    const dashboard = { ...dashboardFixture, widgets: widgets as typeof dashboardFixture.widgets };
    const options = new URLSearchParams("style=vinyl&range=all_time");
    const svg = renderNeteaseSvg(dashboard, "https://aboutme.example.test", options);
    expect(svg).toContain("Week &amp; &lt;Song&gt;");
    expect(svg).not.toContain("All-time Song");
    expect(svg).not.toContain("Private card");
    expect(svg).not.toContain("Future &amp;");
    expect(renderDashboardSvg(dashboard, "https://aboutme.example.test", options)).toContain(
      "ON REPEAT"
    );
  });

  it.each(["identity", "playlists", "showcase", "calendar"])(
    "renders a valid empty %s card",
    (name) => {
      const svg = renderWidgetSvg(
        { ...ranking, type: `music.netease.${name}`, stale: true, data: null },
        "https://aboutme.example.test",
        new URLSearchParams("style=vinyl")
      );
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(document.querySelector("parsererror")).toBeNull();
      expect(svg).toContain("数据待更新");
      expect(svg).not.toMatch(/NaN|undefined|<image|<script|foreignObject/);
    }
  );
});
