import { afterEach, describe, expect, it } from "vitest";

import { appearanceStorageKey, readAppearanceSettings, saveAppearanceSettings } from "./appearance";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.accent;
  delete document.documentElement.dataset.glass;
  delete document.documentElement.dataset.font;
});

describe("appearance settings", () => {
  it("persists validated settings and applies their visual tokens", () => {
    saveAppearanceSettings({ accent: "lilac", glass: "strong", font: "system", rotation: false });

    expect(readAppearanceSettings()).toEqual({
      accent: "lilac",
      glass: "strong",
      font: "system",
      rotation: false
    });
    expect(document.documentElement).toHaveAttribute("data-accent", "lilac");
    expect(document.documentElement).toHaveAttribute("data-glass", "strong");
    expect(document.documentElement).toHaveAttribute("data-font", "system");
  });

  it("uses the original font for settings saved before font selection existed", () => {
    window.localStorage.setItem(
      appearanceStorageKey,
      JSON.stringify({ accent: "blue", glass: "balanced", rotation: true })
    );

    expect(readAppearanceSettings()?.font).toBe("noto");
  });

  it("ignores malformed or unsupported persisted values", () => {
    window.localStorage.setItem(
      appearanceStorageKey,
      JSON.stringify({ accent: "neon", glass: "opaque", rotation: true })
    );

    expect(readAppearanceSettings()).toBeNull();
  });
});
