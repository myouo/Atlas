import type { DashboardReadModel } from "@nivalis/api-client";

export const NATIVE_CAPTURE_VERSION = "web-components-v7-stable-content";

const artworkFields = new Set(["avatarUrl", "coverUrl", "iconUrl", "imageUrls"]);

function normalizeArtwork(value: unknown, field = ""): unknown {
  if (typeof value === "string" && artworkFields.has(field)) {
    // NetEase rotates identical artwork between numbered CDN hosts on each sync.
    return value.replace(/^https:\/\/p\d+\.music\.126\.net\//, "https://music.126.net/");
  }
  if (Array.isArray(value)) return value.map((item) => normalizeArtwork(item, field));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeArtwork(item, key)])
    );
  }
  return value;
}

export function serializeNativeSceneContent(dashboard: DashboardReadModel): string {
  const content = {
    ...dashboard,
    widgets: dashboard.widgets.map((widget) =>
      Object.fromEntries(Object.entries(widget).filter(([key]) => key !== "updatedAt"))
    )
  };
  // Sync timestamps are not rendered. Data, public policies, layout, stale state,
  // publication revision and all presentation settings remain in the fingerprint.
  return JSON.stringify(normalizeArtwork(content));
}

export async function nativeSceneContentHash(dashboard: DashboardReadModel): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serializeNativeSceneContent(dashboard))
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
