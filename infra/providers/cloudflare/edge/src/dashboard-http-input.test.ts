import { describe, expect, it } from "vitest";

import { InvalidDashboardRequestError, parseDashboardDraft } from "./dashboard-http-input";

const widgetId = "00000000-0000-4000-8000-000000001006";

describe("Cloudflare Dashboard Draft input", () => {
  it("parses semantic Widget configuration without accepting Projection data", () => {
    const parsed = parseDashboardDraft(validDraft());
    expect(parsed.widgets[0]).toMatchObject({
      id: widgetId,
      presentationConfig: { detailPanel: "recent", showArtists: false },
      type: "music.netease.overview"
    });
    expect(parsed.widgets[0]).not.toHaveProperty("data");
  });

  it.each([
    { ...validDraft(), projection: {} },
    { ...validDraft(), widgets: [{ ...validDraft().widgets[0], presentationConfig: [] }] },
    {
      ...validDraft(),
      layout: { ...validDraft().layout, lg: [{ h: 4, i: widgetId, w: 8, x: 0.5, y: 0 }] }
    }
  ])("rejects malformed or extra external fields", (input) => {
    expect(() => parseDashboardDraft(input)).toThrow(InvalidDashboardRequestError);
  });
});

function validDraft() {
  const placement = { h: 4, i: widgetId, w: 4, x: 0, y: 0 };
  return {
    layout: { lg: [placement], md: [placement], sm: [placement] },
    widgets: [
      {
        dataConfig: { range: "7d" },
        enabled: true,
        id: widgetId,
        presentationConfig: { detailPanel: "recent", showArtists: false },
        provider: "netease",
        schemaVersion: 2,
        title: "网易云音乐",
        type: "music.netease.overview"
      }
    ]
  };
}
