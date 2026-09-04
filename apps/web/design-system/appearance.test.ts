import { afterEach, describe, expect, it } from "vitest";

import { appearanceStorageKey, readAppearanceSettings, saveAppearanceSettings } from "./appearance";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.accent;
  delete document.documentElement.dataset.glass;
});

describe("appearance settings", () => {
  it("persists validated settings and applies their visual tokens", () => {
    saveAppearanceSettings({ accent: "lilac", glass: "strong", rotation: true });

    expect(readAppearanceSettings()).toEqual({
      accent: "lilac",
      glass: "strong",
      rotation: true
    });
    expect(document.documentElement).toHaveAttribute("data-accent", "lilac");
    expect(document.documentElement).toHaveAttribute("data-glass", "strong");
  });

  it("ignores malformed or unsupported persisted values", () => {
    window.localStorage.setItem(
      appearanceStorageKey,
      JSON.stringify({ accent: "neon", glass: "opaque", rotation: true })
    );

    expect(readAppearanceSettings()).toBeNull();
  });
});
