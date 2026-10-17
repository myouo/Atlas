import { describe, expect, it, vi } from "vitest";
import { dashboardFixture } from "./test-fixture";
import {
  NATIVE_CAPTURE_VERSION,
  nativeSceneContentHash,
  nativeSceneScopeHash
} from "./native-scene-cache";
import {
  loadNativeScene,
  publishNativeScene,
  sceneKeys,
  sceneOptions,
  type PublishedScene
} from "./native-svg-service";
import { handleScenePublication } from "./scene-publication";

const options = new URLSearchParams("theme=light&period=month&range=week");
const token = "fixture-publication-secret";

function memoryCache() {
  const values = new Map<string, string>();
  const cache = {
    get: vi.fn(async (key: string | string[], type?: unknown) => {
      if (typeof key !== "string") throw new Error("Batch reads are not used in these tests");
      const value = values.get(key);
      return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
    delete: vi.fn()
  } as KVNamespace;
  return { cache, values };
}

async function capture(dashboard = dashboardFixture): Promise<PublishedScene> {
  const card = {
    id: "profile",
    type: "profile",
    title: "About Me",
    width: 668,
    height: 80,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="668" height="80"><text>Original Web card</text></svg>'
  };
  return {
    version: NATIVE_CAPTURE_VERSION,
    contentHash: await nativeSceneContentHash(dashboard),
    scopeHash: await nativeSceneScopeHash(dashboard),
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
    options: sceneOptions(options),
    scene: {
      profile: card,
      widgets: dashboard.widgets
        .filter((widget) => widget.enabled)
        .map((widget) => ({ ...card, id: widget.id, type: widget.type, title: widget.title }))
    }
  };
}

describe("durable public SVG delivery", () => {
  it("keeps the last successful native image when actual Provider data changes, without a browser binding", async () => {
    const { cache } = memoryCache();
    const before = await capture();
    await publishNativeScene(dashboardFixture, before, cache);
    const fresh = await loadNativeScene(dashboardFixture, options, { SVG_CACHE: cache });
    expect(fresh.outdated).toBe(false);
    const after = structuredClone(dashboardFixture);
    Object.assign(after.widgets[0]!, { data: { value: 298 } });
    const fallback = await loadNativeScene(after, options, { SVG_CACHE: cache });
    expect(fallback.widgets).toEqual(before.scene.widgets);
    expect(fallback.outdated).toBe(true);
    expect(fallback.capturedAt).toBe(before.capturedAt);
    const keys = await sceneKeys(dashboardFixture, sceneOptions(options));
    expect(cache.put).toHaveBeenCalledWith(keys.latest, expect.any(String));
    const updated = await capture(after);
    await publishNativeScene(after, updated, cache);
    expect((await loadNativeScene(after, options, { SVG_CACHE: cache })).outdated).toBe(false);
  });

  it.each(["disabled", "scope", "identity", "revision", "disclosure"])(
    "does not reuse an old image after a %s change",
    async (change) => {
      const { cache } = memoryCache();
      await publishNativeScene(dashboardFixture, await capture(), cache);
      const after = structuredClone(dashboardFixture);
      if (change === "disabled") Object.assign(after.widgets[0]!, { enabled: false });
      if (change === "scope") Object.assign(after.widgets[0]!, { dataConfig: { publicLimit: 1 } });
      if (change === "identity") after.profile.displayName = "New identity";
      if (change === "revision") after.revision += 1;
      if (change === "disclosure")
        Object.assign(after.widgets[0]!, { data: { publicFields: ["name"] } });
      await expect(loadNativeScene(after, options, { SVG_CACHE: cache })).rejects.toThrow(
        "has not been published"
      );
    }
  );

  it.each(["month", "week"] as const)(
    "rejects a previous listening %s even when content is otherwise identical",
    async (period) => {
      const { cache } = memoryCache();
      const before = structuredClone(dashboardFixture);
      Object.assign(before.widgets[0]!, {
        type: "music.netease.calendar",
        data: { [period]: { points: [{ date: "2026-10-03", minutes: 40 }] } }
      });
      const selection = new URLSearchParams({ period });
      await publishNativeScene(
        before,
        { ...(await capture(before)), options: sceneOptions(selection) },
        cache
      );
      const after = structuredClone(before);
      Object.assign(after.widgets[0]!, {
        data: {
          [period]: {
            points: [{ date: period === "month" ? "2026-11-03" : "2026-10-10", minutes: 40 }]
          }
        }
      });
      await expect(loadNativeScene(after, selection, { SVG_CACHE: cache })).rejects.toThrow(
        "has not been published"
      );
    }
  );

  it("rejects interrupted captures when the dashboard changes and retains the last success", async () => {
    const { cache } = memoryCache();
    const before = await capture();
    await publishNativeScene(dashboardFixture, before, cache);
    const after = structuredClone(dashboardFixture);
    Object.assign(after.widgets[0]!, { data: { value: 299 } });
    await expect(publishNativeScene(after, before, cache)).rejects.toThrow(
      "changed during capture"
    );
    expect((await loadNativeScene(after, options, { SVG_CACHE: cache })).contentHash).toBe(
      before.contentHash
    );
  });
});

describe("authenticated native scene publication", () => {
  function setup() {
    const { cache } = memoryCache();
    const env = { SVG_CACHE: cache, SVG_PUBLISH_TOKEN: token, NIVALIS_API: {} as Fetcher };
    const load = vi.fn(async () => dashboardFixture);
    const upload = (body: unknown, authorization = `Bearer ${token}`) =>
      handleScenePublication(
        new Request("https://svg.test/internal/scenes", {
          method: "POST",
          headers: { Authorization: authorization },
          body: JSON.stringify(body)
        }),
        env,
        load
      );
    return { env, load, upload, cache };
  }

  it("rejects anonymous and non-ASCII credentials before reading or writing public data", async () => {
    const { upload, load, cache } = setup();
    expect((await upload({}, "")).status).toBe(401);
    expect((await upload({}, `Bearer ${"é".repeat(token.length)}`)).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("publishes valid native captures and rejects obsolete snapshots with 409", async () => {
    const { upload, env } = setup();
    const published = await capture();
    expect((await upload(published)).status).toBe(200);
    expect((await loadNativeScene(dashboardFixture, options, env)).outdated).toBe(false);
    expect((await upload({ ...published, contentHash: "0".repeat(64) })).status).toBe(409);
  });

  it.each(["private-card", "script", "remote-image"])(
    "rejects %s in a publication",
    async (change) => {
      const { upload } = setup();
      const published = await capture();
      const widget = published.scene.widgets[0]!;
      if (change === "private-card") Object.assign(widget, { id: "disabled-card" });
      if (change === "script")
        Object.assign(widget, { svg: "<svg><script>alert(1)</script></svg>" });
      if (change === "remote-image")
        Object.assign(widget, {
          svg: '<svg><image href="https://private.test/secret.png"/></svg>'
        });
      expect((await upload(published)).status).toBe(400);
    }
  );
});
