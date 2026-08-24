import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { SecretContext, SecretProtector } from "@nivalis/application";
import type { ProtectedSecret } from "@nivalis/domain";

const ENCRYPTION_VERSION = 1;

export class AesGcmSecretProtector implements SecretProtector {
  constructor(
    private readonly key: Uint8Array,
    private readonly keyId: string
  ) {
    if (key.byteLength !== 32) throw new Error("Credential master key must be 32 bytes.");
    if (!keyId) throw new Error("Credential key id is required.");
  }

  async protect(secret: string, context: SecretContext): Promise<ProtectedSecret> {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce, { authTagLength: 16 });
    cipher.setAAD(associatedData(context, this.keyId));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      authTag: cipher.getAuthTag(),
      ciphertext,
      encryptionVersion: ENCRYPTION_VERSION,
      keyId: this.keyId,
      nonce
    };
  }

  async unprotect(secret: ProtectedSecret, context: SecretContext): Promise<string> {
    if (secret.encryptionVersion !== ENCRYPTION_VERSION || secret.keyId !== this.keyId) {
      throw new Error("Protected secret key version is unavailable.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, secret.nonce, {
      authTagLength: 16
    });
    decipher.setAAD(associatedData(context, secret.keyId));
    decipher.setAuthTag(secret.authTag);
    return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]).toString("utf8");
  }
}

export function decodeCredentialMasterKey(value: string): Uint8Array {
  const key = Buffer.from(value, "base64url");
  if (key.byteLength !== 32) {
    throw new Error("NIVALIS_CREDENTIAL_MASTER_KEY must be base64url-encoded 32 bytes.");
  }
  return key;
}

function associatedData(context: SecretContext, keyId: string) {
  return Buffer.from(
    JSON.stringify({
      credentialType: context.credentialType,
      encryptionVersion: ENCRYPTION_VERSION,
      keyId,
      ownerId: context.ownerId,
      purpose: context.purpose,
      subjectId: context.subjectId
    })
  );
}
