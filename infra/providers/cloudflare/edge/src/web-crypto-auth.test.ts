import { describe, expect, it } from "vitest";

import { WebCryptoAuthTokenFactory, WebCryptoSecretProtector } from "./web-crypto-auth";

const context = {
  credentialType: "pkce_verifier",
  ownerId: "00000000-0000-4000-8000-000000000001",
  purpose: "oauth_pkce" as const,
  subjectId: "state-hash"
};

describe("Worker WebCrypto auth primitives", () => {
  it("encrypts short-lived OAuth material with contextual AEAD", async () => {
    const protector = new WebCryptoSecretProtector(new Uint8Array(32).fill(7), "test-key");
    const protectedSecret = await protector.protect("pkce-secret", context);

    expect(new TextDecoder().decode(protectedSecret.ciphertext)).not.toContain("pkce-secret");
    await expect(protector.unprotect(protectedSecret, context)).resolves.toBe("pkce-secret");
    await expect(
      protector.unprotect(protectedSecret, { ...context, subjectId: "another-state" })
    ).rejects.toThrow();
  });

  it("creates PKCE and opaque-token hashes through WebCrypto", async () => {
    const tokens = new WebCryptoAuthTokenFactory();
    expect(tokens.createOpaqueToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(tokens.createPkceChallenge("verifier")).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(tokens.hashOpaqueToken("session-token")).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
