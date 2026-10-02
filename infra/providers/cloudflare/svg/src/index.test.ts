import { describe, expect, it } from "vitest";

import worker, { selectRoute } from "./index";
import { dashboardFixture } from "./test-fixture";

const env = {
  NIVALIS_API: {
    fetch: async () => Response.json(dashboardFixture),
    connect: (() => {
      throw new Error("Socket access is not used by SVG tests");
    }) as Fetcher["connect"]
  },
  SITE_URL: "https://aboutme.nivalis.is"
} as Env;

describe("SVG Worker routes", () => {
  it("resolves a generic dashboard and future Widget routes", () => {
    expect(selectRoute("/dashboard.svg")).toEqual({ kind: "dashboard" });
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
      widgets: [{ id: "first-card", svg: "https://svg.example.test/widgets/first-card.svg" }]
    });
  });

  it("never publishes a disabled Widget by its stable ID", async () => {
    const response = await worker.fetch(
      new Request("https://svg.example.test/widgets/disabled-card.svg"),
      env
    );
    expect(response.status).toBe(404);
  });
});
