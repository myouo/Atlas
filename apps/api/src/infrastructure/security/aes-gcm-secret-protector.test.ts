import { describe, expect, it } from "vitest";

import { AesGcmSecretProtector } from "./aes-gcm-secret-protector";

const context = {
  credentialType: "music_u",
  ownerId: "00000000-0000-4000-8000-000000000001",
  purpose: "provider_credential" as const,
  subjectId: "00000000-0000-4000-8000-000000000002"
};

describe("AES-GCM SecretProtector", () => {
  it("round-trips a secret while producing randomized ciphertext without plaintext", async () => {
    const protector = new AesGcmSecretProtector(Buffer.alloc(32, 7), "test-primary");
    const secret = "phase-five-private-cookie-value";
    const first = await protector.protect(secret, context);
    const second = await protector.protect(secret, context);

    expect(await protector.unprotect(first, context)).toBe(secret);
    expect(Buffer.from(first.ciphertext).toString("utf8")).not.toContain(secret);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(first.nonce).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
  });

  it("rejects a wrong key, altered AAD, and tampered ciphertext", async () => {
    const protector = new AesGcmSecretProtector(Buffer.alloc(32, 7), "test-primary");
    const protectedSecret = await protector.protect("credential-value", context);
    await expect(
      new AesGcmSecretProtector(Buffer.alloc(32, 8), "test-primary").unprotect(
        protectedSecret,
        context
      )
    ).rejects.toThrow();
    await expect(
      protector.unprotect(protectedSecret, { ...context, subjectId: "different-connection" })
    ).rejects.toThrow();
    await expect(
      protector.unprotect(
        {
          ...protectedSecret,
          ciphertext: Buffer.concat([protectedSecret.ciphertext, Buffer.from([1])])
        },
        context
      )
    ).rejects.toThrow();
  });
});
