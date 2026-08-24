import { describe, expect, it } from "vitest";

import { createProjectionKey, Sha256ViewVersionFactory } from "./projection-key";

describe("Projection identity and representation versions", () => {
  it("canonicalizes config order while separating data-relevant config", () => {
    const left = createProjectionKey({
      dataConfig: { range: "7d", showArtists: true },
      schemaVersion: 1,
      type: "music.netease.overview"
    });
    const reordered = createProjectionKey({
      dataConfig: { showArtists: true, range: "7d" },
      schemaVersion: 1,
      type: "music.netease.overview"
    });
    const changed = createProjectionKey({
      dataConfig: { range: "30d", showArtists: true },
      schemaVersion: 1,
      type: "music.netease.overview"
    });
    expect(left).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toBe(left);
    expect(changed).not.toBe(left);
  });

  it("does not partition projections for presentation-only changes", () => {
    const compact = {
      dataConfig: { range: "7d" },
      presentationConfig: { showArtists: false },
      schemaVersion: 2,
      type: "music.netease.overview" as const
    };
    const detailed = {
      ...compact,
      presentationConfig: { showArtists: true, showTrend: true }
    };
    expect(createProjectionKey(compact)).toBe(createProjectionKey(detailed));
  });

  it("changes a public view version when a Projection version changes", () => {
    const versions = new Sha256ViewVersionFactory();
    const before = versions.createViewVersion("revision-one", [
      { projectionKey: "a".repeat(64), projectionVersion: "projection-one", widgetId: "widget" }
    ]);
    const after = versions.createViewVersion("revision-one", [
      { projectionKey: "a".repeat(64), projectionVersion: "projection-two", widgetId: "widget" }
    ]);
    expect(after).not.toBe(before);
  });

  it("changes a view version when Last Known Good data becomes effectively stale", () => {
    const versions = new Sha256ViewVersionFactory();
    const fresh = versions.createViewVersion("revision-one", [
      {
        projectionKey: "a".repeat(64),
        projectionVersion: "projection-one",
        representationVersion: "projection-one:false",
        widgetId: "widget"
      }
    ]);
    const stale = versions.createViewVersion("revision-one", [
      {
        projectionKey: "a".repeat(64),
        projectionVersion: "projection-one",
        representationVersion: "projection-one:true",
        widgetId: "widget"
      }
    ]);
    expect(stale).not.toBe(fresh);
  });
});
