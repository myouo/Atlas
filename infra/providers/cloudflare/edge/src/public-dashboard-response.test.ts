import { describe, expect, it } from "vitest";
import { ownerDashboardResponse, publicDashboardResponse } from "./public-dashboard-response";

describe("public dashboard transport", () => {
  it("keeps private live data out of shared HTTP caches including conditional responses", async () => {
    const first = ownerDashboardResponse(
      new Request("https://edge.invalid/private"),
      { private: true },
      "one"
    );
    const unchanged = ownerDashboardResponse(
      new Request("https://edge.invalid/private", {
        headers: { "If-None-Match": first.headers.get("etag")! }
      }),
      { private: true },
      "one"
    );
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(unchanged.headers.get("cache-control")).toBe("no-store");
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
  });
  it("streams gzip without changing the public payload or CORS variation", async () => {
    const body = {
      history: Array.from({ length: 500 }, (_, index) => ({ date: `day-${index}`, minutes: 42 }))
    };
    const response = publicDashboardResponse(
      new Request("https://edge.invalid/view", { headers: { "Accept-Encoding": "br, gzip" } }),
      body,
      "one",
      new Headers({ Vary: "Origin" })
    );
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Origin, Accept-Encoding");
    expect(response.headers.get("cache-control")).not.toContain("no-transform");
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(body).length / 3);
    const decoded = new Response(
      new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"))
    );
    await expect(decoded.json()).resolves.toEqual(body);
  });

  it.each(['W/"view:one"', '"other", "view:one"', "*"])(
    "returns no body for a matching validator %s",
    async (etag) => {
      const response = publicDashboardResponse(
        new Request("https://edge.invalid/view", { headers: { "If-None-Match": etag } }),
        { value: 42 },
        "one"
      );
      expect(response.status).toBe(304);
      expect(await response.text()).toBe("");
      expect(response.headers.get("etag")).toBe('W/"view:one"');
    }
  );

  it("sends changed views and respects clients which reject gzip", async () => {
    const response = publicDashboardResponse(
      new Request("https://edge.invalid/view", {
        headers: { "If-None-Match": 'W/"view:one"', "Accept-Encoding": "gzip;q=0, *;q=1" }
      }),
      { value: 43 },
      "two"
    );
    expect(response.status).toBe(200);
    expect(response.headers.has("content-encoding")).toBe(false);
    await expect(response.json()).resolves.toEqual({ value: 43 });
  });
});
