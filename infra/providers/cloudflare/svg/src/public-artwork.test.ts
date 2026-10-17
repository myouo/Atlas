import { describe, expect, it, vi } from "vitest";
import { fetchPublicArtwork } from "./public-artwork";

describe("native public artwork fallback", () => {
  it("uses an equivalent numbered CDN after a connection timeout and preserves artwork identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Connect timeout"))
      .mockResolvedValueOnce(new Response("art", { headers: { "Content-Type": "image/jpeg" } }));
    const image = await fetchPublicArtwork(
      new URL("https://p3.music.126.net/same-cover.jpg?param=128y128"),
      fetcher
    );
    expect(image).toBe("data:image/jpeg;base64,YXJ0");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://p3.music.126.net/same-cover.jpg?param=128y128",
      "https://p4.music.126.net/same-cover.jpg?param=128y128"
    ]);
  });

  it("fails when every eligible route fails rather than publishing a missing cover", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      fetchPublicArtwork(new URL("https://p3.music.126.net/song.jpg"), fetcher)
    ).rejects.toThrow("all eligible CDN routes");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects non-image responses and does not try other hosts for unrelated artwork", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("challenge", { headers: { "Content-Type": "text/html" } }));
    await expect(
      fetchPublicArtwork(new URL("https://aboutme.nivalis.is/images/avatar.webp"), fetcher)
    ).rejects.toThrow("all eligible CDN routes");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
