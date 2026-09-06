import type { JsonObject, NormalizedProviderData } from "@nivalis/domain";

const INLINE_BYTES = 512_000;
const MAX_BYTES = 16_000_000;
const CHUNK_BYTES = 512_000;
const MARKER = "_nivalisNormalizedStorage";

/** Internal storage encoding, never returned as Provider or HTTP data. */
export async function prepareNormalizedStorage(
  database: D1Database,
  snapshotId: string,
  normalized: NormalizedProviderData
) {
  const json = JSON.stringify(normalized);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_BYTES) throw new Error("Normalized storage byte limit exceeded.");
  if (bytes.length <= INLINE_BYTES)
    return {
      messageJson: json,
      catalogJson: JSON.stringify(normalized.data),
      chunks: [] as D1PreparedStatement[]
    };
  const digest = await hash(bytes);
  const compressed = await transform(bytes, new CompressionStream("gzip"));
  const count = Math.ceil(compressed.length / CHUNK_BYTES);
  const reference = { snapshotId, count, bytes: bytes.length, sha256: digest, encoding: "gzip" };
  const chunks = Array.from({ length: count }, (_, index) =>
    database
      .prepare(
        "INSERT INTO provider_normalized_payload_chunks (snapshot_id, chunk_index, payload) VALUES (?, ?, ?)"
      )
      .bind(
        snapshotId,
        index,
        compressed.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).buffer
      )
  );
  // Keep only the minimal account index for existing secret-free connection views.
  const account = normalized.data.account ?? null;
  return {
    messageJson: JSON.stringify({ meta: normalized.meta, data: {}, [MARKER]: reference }),
    catalogJson: JSON.stringify({ account, [MARKER]: { ...reference, select: "data" } }),
    chunks
  };
}

export async function readStoredNormalizedJson(
  database: D1Database,
  json: string
): Promise<JsonObject> {
  const document = jsonObject(JSON.parse(json));
  if (!(MARKER in document)) return document;
  const reference = jsonObject(document[MARKER]);
  if (
    typeof reference.snapshotId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(reference.snapshotId) ||
    !Number.isInteger(reference.count) ||
    typeof reference.count !== "number" ||
    reference.count < 1 ||
    reference.count > 64 ||
    typeof reference.bytes !== "number" ||
    !Number.isInteger(reference.bytes) ||
    reference.bytes < 1 ||
    reference.bytes > MAX_BYTES ||
    typeof reference.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(reference.sha256) ||
    reference.encoding !== "gzip" ||
    (reference.select !== undefined && reference.select !== "data")
  )
    throw new Error("Invalid normalized storage reference.");
  const result = await database
    .prepare(
      "SELECT chunk_index, payload FROM provider_normalized_payload_chunks WHERE snapshot_id = ? ORDER BY chunk_index"
    )
    .bind(reference.snapshotId)
    .all<{ chunk_index: number; payload: ArrayBuffer | Uint8Array }>();
  if (result.results.length !== reference.count)
    throw new Error("Incomplete normalized payload chunks.");
  const chunks = result.results.map((row, index) => {
    const bytes = new Uint8Array(row.payload);
    if (row.chunk_index !== index || bytes.length > CHUNK_BYTES)
      throw new Error("Invalid normalized payload chunk.");
    return bytes;
  });
  const compressed = concatenate(chunks);
  const bytes = await transform(compressed, new DecompressionStream("gzip"));
  if (bytes.length !== reference.bytes || (await hash(bytes)) !== reference.sha256)
    throw new Error("Normalized payload integrity check failed.");
  const decoded = jsonObject(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  return reference.select === "data" ? jsonObject(decoded.data) : decoded;
}

function jsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a normalized JSON object.");
  return value as JsonObject;
}
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function concatenate(chunks: readonly Uint8Array[]) {
  const bytes = new Uint8Array(chunks.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const reader = new Blob([new Uint8Array(bytes).buffer]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Normalized storage byte limit exceeded.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return concatenate(chunks);
}
