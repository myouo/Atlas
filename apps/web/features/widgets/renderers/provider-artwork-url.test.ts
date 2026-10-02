import { describe, expect, it } from "vitest";
import { providerArtworkSize, providerArtworkUrl } from "./provider-artwork-url";

describe("provider artwork delivery", () => {
  it("sizes thumbnails to the visible slot with a bounded high DPI budget", () => {
    expect(providerArtworkSize(26, 2)).toBe(64);
    expect(providerArtworkSize(78, 2)).toBe(192);
    expect(providerArtworkSize(800, 4)).toBe(512);
  });
  it("preserves artwork identity and other query fields while replacing the size", () => {
    expect(
      providerArtworkUrl("https://p3.music.126.net/cover.jpg?param=2400y2400&quality=90", 96)
    ).toBe("https://p3.music.126.net/cover.jpg?param=96y96&quality=90");
    for (const url of [
      "https://other.invalid/cover.jpg",
      "https://p3.music.126.net/decoration.gif",
      "/images/avatar.webp"
    ])
      expect(providerArtworkUrl(url, 64)).toBe(url);
  });
});
