import { describe, expect, it } from "vitest";

import { decodeRawPayload, encodeRawPayload } from "./raw-payload-codec";

describe("D1 Raw payload codec", () => {
  it("keeps small JSON directly queryable", async () => {
    const json = JSON.stringify({ code: 200, data: [1, 2, 3] });
    const stored = await encodeRawPayload(json, 1_024);

    expect(stored).toEqual({ payloadBlob: null, payloadEncoding: "json", payloadJson: json });
    await expect(decodeRawPayload(stored)).resolves.toBe(json);
  });

  it("compresses large sanitized JSON and round-trips it exactly", async () => {
    const json = JSON.stringify({ code: 200, items: Array(8_000).fill("sanitized-record") });
    const stored = await encodeRawPayload(json, 1_024);

    expect(stored.payloadEncoding).toBe("gzip");
    expect(stored.payloadJson).toBe("null");
    expect(stored.payloadBlob?.byteLength).toBeLessThan(new TextEncoder().encode(json).byteLength);
    await expect(decodeRawPayload(stored)).resolves.toBe(json);
  });

  it("fails closed when compressed evidence is missing", async () => {
    await expect(
      decodeRawPayload({ payloadBlob: null, payloadEncoding: "gzip", payloadJson: "null" })
    ).rejects.toThrow(/missing its blob/i);
  });
});
