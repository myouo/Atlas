// Numbered NetEase hosts serve the same artwork identity. Try another host when
// an individual CDN route is unavailable to a CI runner.
export async function fetchPublicArtwork(asset: URL, fetcher: typeof fetch = fetch) {
  const candidates = [asset.toString()];
  if (/^p\d+\.music\.126\.net$/.test(asset.hostname)) {
    for (const host of ["p3.music.126.net", "p4.music.126.net", "p1.music.126.net"]) {
      const alternate = new URL(asset);
      alternate.hostname = host;
      if (!candidates.includes(alternate.toString())) candidates.push(alternate.toString());
    }
  }
  let failure: unknown;
  for (const url of candidates) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Public artwork HTTP ${response.status}`);
      const type = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      if (!type.startsWith("image/")) throw new Error("Public artwork response is not an image");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2_000_000) throw new Error("Artwork exceeds export budget");
      return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch (error) {
      failure = error;
    }
  }
  throw new Error("Public artwork is unavailable on all eligible CDN routes", { cause: failure });
}
