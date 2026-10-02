import { describe, expect, it } from "vitest";
import { dashboardFixture } from "./test-fixture";
import { nativeSceneContentHash } from "./native-scene-cache";

describe("native SVG content cache", () => {
  it("reuses a capture when only sync metadata and equivalent artwork hosts change", async () => {
    const before = structuredClone(dashboardFixture);
    const widget = before.widgets[0]!;
    Object.assign(widget, {
      updatedAt: "2026-10-02T06:00:00.000Z",
      data: {
        coverUrl: "https://p3.music.126.net/artwork/song.jpg?param=128y128",
        imageUrls: ["https://p4.music.126.net/artwork/album.jpg"],
        playCount: 9
      }
    });
    const after = structuredClone(before);
    Object.assign(after.widgets[0]!, {
      updatedAt: "2026-10-02T12:00:00.000Z",
      data: {
        coverUrl: "https://p4.music.126.net/artwork/song.jpg?param=128y128",
        imageUrls: ["https://p3.music.126.net/artwork/album.jpg"],
        playCount: 9
      }
    });
    expect(await nativeSceneContentHash(after)).toBe(await nativeSceneContentHash(before));
    expect(before.widgets[0]!.data).toMatchObject({
      coverUrl: "https://p3.music.126.net/artwork/song.jpg?param=128y128"
    });
  });

  it.each(["data", "policy", "presentation", "enabled", "stale", "revision", "artwork"])(
    "invalidates captures when %s changes",
    async (change) => {
      const before = structuredClone(dashboardFixture);
      Object.assign(before.widgets[0]!, {
        data: {
          metric: "records_collected",
          value: 297,
          coverUrl: "https://p3.music.126.net/original.jpg"
        }
      });
      const after = structuredClone(before);
      const widget = after.widgets[0]!;
      if (change === "data") Object.assign(widget, { data: { ...widget.data, value: 42 } });
      if (change === "policy") Object.assign(widget, { dataConfig: { publicLimit: 1 } });
      if (change === "presentation")
        Object.assign(widget, { presentationConfig: { showValue: false } });
      if (change === "enabled") Object.assign(widget, { enabled: false });
      if (change === "stale") Object.assign(widget, { stale: !widget.stale });
      if (change === "revision") Object.assign(after, { revision: before.revision + 1 });
      if (change === "artwork")
        Object.assign(widget, {
          data: { ...widget.data, coverUrl: "https://p3.music.126.net/different.jpg" }
        });
      expect(await nativeSceneContentHash(after)).not.toBe(await nativeSceneContentHash(before));
    }
  );
});
