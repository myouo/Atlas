const DEFAULT_COMPRESSION_THRESHOLD = 64 * 1024;

export interface StoredRawPayload {
  readonly payloadBlob: ArrayBuffer | null;
  readonly payloadEncoding: "gzip" | "json";
  readonly payloadJson: string;
}

export async function encodeRawPayload(
  payloadJson: string,
  compressionThreshold = DEFAULT_COMPRESSION_THRESHOLD
): Promise<StoredRawPayload> {
  const bytes = new TextEncoder().encode(payloadJson);
  if (bytes.byteLength < compressionThreshold) {
    return { payloadBlob: null, payloadEncoding: "json", payloadJson };
  }
  const compressed = await streamBytes(bytes, new CompressionStream("gzip"));
  if (compressed.byteLength >= bytes.byteLength) {
    return { payloadBlob: null, payloadEncoding: "json", payloadJson };
  }
  return { payloadBlob: compressed, payloadEncoding: "gzip", payloadJson: "null" };
}

export async function decodeRawPayload(input: StoredRawPayload): Promise<string> {
  if (input.payloadEncoding === "json") return input.payloadJson;
  if (!input.payloadBlob) throw new Error("Compressed Raw payload is missing its blob.");
  const decompressed = await streamBytes(
    new Uint8Array(input.payloadBlob),
    new DecompressionStream("gzip")
  );
  return new TextDecoder().decode(decompressed);
}

async function streamBytes(input: Uint8Array, transform: CompressionStream | DecompressionStream) {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const output = new Response(transform.readable).arrayBuffer();
  const writer = transform.writable.getWriter();
  await writer.write(copy.buffer);
  await writer.close();
  return output;
}
