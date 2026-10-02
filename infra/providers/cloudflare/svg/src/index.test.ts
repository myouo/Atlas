import { describe, expect, it } from "vitest";

import { createSvgWorker, selectRoute } from "./index";
import { dashboardFixture } from "./test-fixture";
import type { NativeSvgScene } from "./native-svg-types";
import { escapeXml } from "./svg-utils";

const worker = createSvgWorker(async (dashboard): Promise<NativeSvgScene> => ({
  profile: {
    id: "profile",
    type: "profile",
    title: "About Me",
    width: 668,
    height: 80,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="668" height="80"><text>About Me</text></svg>'
  },
  widgets: dashboard.widgets.map((widget) => ({
    id: widget.id,
    type: widget.type,
    title: widget.title,
    width: 668,
    height: 305,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="668" height="305"><text>${escapeXml(widget.title)}</text></svg>`
  }))
}));

const env = {
  NIVALIS_API: {
    fetch: async () => Response.json(dashboardFixture),
    connect: (() => {
      throw new Error("Socket access is not used by SVG tests");
    }) as Fetcher["connect"]
  },
  SITE_URL: "https://aboutme.nivalis.is"
} satisfies Pick<Env, "NIVALIS_API" | "SITE_URL">;

describe("SVG Worker routes", () => {
  it("resolves a generic dashboard and future Widget routes", () => {
    expect(selectRoute("/dashboard.svg")).toEqual({ kind: "dashboard" });
    expect(selectRoute("/netease.svg")).toEqual({ kind: "provider", value: "netease" });
    expect(selectRoute("/render.svg", new URLSearchParams("provider=steam"))).toEqual({
      kind: "provider",
      value: "steam"
    });
    expect(
      selectRoute("/render.svg", new URLSearchParams("type=system.stats&id=first-card"))
    ).toEqual({ kind: "widget-type", value: "system.stats" });
    expect(selectRoute("/widgets/first-card.svg")).toEqual({
      kind: "widget-id",
      value: "first-card"
    });
    expect(selectRoute("/types/future.provider.summary.svg")).toEqual({
      kind: "widget-type",
      value: "future.provider.summary"
    });
    expect(selectRoute("/netease/calendar.svg")).toEqual({
      kind: "widget-type",
      value: "music.netease.calendar"
    });
    expect(selectRoute("/steam/profile.svg")).toEqual({
      kind: "widget-type",
      value: "steam.profile"
    });
    expect(selectRoute("/unsafe/../../secret.svg")).toBeNull();
  });

  it("serves valid SVG, a stable manifest, and conditional responses", async () => {
    const url = "https://svg.example.test/dashboard.svg";
    const image = await worker.fetch(new Request(url), env);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/svg+xml");
    expect(await image.text()).toContain("Future &amp; &lt;Card&gt;");

    const notModified = await worker.fetch(
      new Request(url, { headers: { "If-None-Match": image.headers.get("etag")! } }),
      env
    );
    expect(notModified.status).toBe(304);

    const weakNotModified = await worker.fetch(
      new Request(url, { headers: { "If-None-Match": `W/${image.headers.get("etag")!}` } }),
      env
    );
    expect(weakNotModified.status).toBe(304);

    const manifest = await worker.fetch(new Request("https://svg.example.test/manifest.json"), env);
    expect(await manifest.json()).toMatchObject({
      themes: ["light", "dark"],
      widgets: [{ id: "first-card", svg: "https://svg.example.test/render.svg?id=first-card" }]
    });
  });

  it("never publishes a disabled Widget by its stable ID", async () => {
    const response = await worker.fetch(
      new Request("https://svg.example.test/widgets/disabled-card.svg"),
      env
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for an empty NetEase collection and keeps HEAD responses bodyless", async () => {
    const missing = await worker.fetch(
      new Request("https://svg.example.test/netease.svg?style=vinyl"),
      env
    );
    expect(missing.status).toBe(404);
    const head = await worker.fetch(
      new Request("https://svg.example.test/dashboard.svg", { method: "HEAD" }),
      env
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("etag")).toBeTruthy();
  });

  it.each(["light", "dark"])(
    "renders through the common entry in %s mode without exposing disabled cards",
    async (theme) => {
      const response = await worker.fetch(
        new Request(
          `https://svg.example.test/render.svg?type=system.stats&id=first-card&theme=${theme}`
        ),
        env
      );
      expect(response.status).toBe(200);
      const svg = await response.text();
      expect(svg).toContain(`data-theme="${theme}"`);
      expect(svg).toContain("Future &amp; &lt;Card&gt;");
      expect(svg).not.toContain("Hidden card");
    }
  );

  it("rejects invalid themes and selectors without falling back to the full dashboard", async () => {
    expect(
      (await worker.fetch(new Request("https://svg.example.test/render.svg?theme=auto"), env))
        .status
    ).toBe(400);
    expect(
      (await worker.fetch(new Request("https://svg.example.test/render.svg?id=../private"), env))
        .status
    ).toBe(404);
  });
});
