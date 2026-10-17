const artworkSizes = [64, 96, 128, 192, 256, 384, 512] as const;

export function providerArtworkSize(slot: number, pixelRatio: number): number {
  const pixels = Math.max(64, (slot || 128) * Math.min(2, Math.max(1, pixelRatio || 1)));
  return artworkSizes.find((size) => size >= pixels) ?? 512;
}

export function providerArtworkUrl(source: string, size: number): string {
  try {
    const url = new URL(source);
    if (
      url.protocol !== "https:" ||
      !/^p\d+\.music\.126\.net$/.test(url.hostname) ||
      !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)
    )
      return source;
    url.searchParams.set("param", `${size}y${size}`);
    return url.toString();
  } catch {
    return source;
  }
}
