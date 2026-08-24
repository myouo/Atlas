import type { ProjectionIdentityInput } from "@nivalis/domain";

export async function createPortableProjectionKey(input: ProjectionIdentityInput) {
  const bytes = new TextEncoder().encode(
    canonicalJson({
      dataConfig: input.dataConfig,
      schemaVersion: input.schemaVersion,
      type: input.type
    })
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
