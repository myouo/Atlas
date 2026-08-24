import type { AuthTokenFactory, SecretContext, SecretProtector } from "@nivalis/application";
import type { ProtectedSecret } from "@nivalis/domain";

const ENCRYPTION_VERSION = 1;

export class WebCryptoAuthTokenFactory implements AuthTokenFactory {
  createOpaqueToken(bytes: number) {
    return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
  }

  async createPkceChallenge(verifier: string) {
    return base64Url(await sha256(verifier));
  }

  async hashOpaqueToken(token: string) {
    return hex(await sha256(token));
  }

  createUuid() {
    return crypto.randomUUID();
  }
}

export class WebCryptoSecretProtector implements SecretProtector {
  private readonly cryptoKey: Promise<CryptoKey>;

  constructor(
    key: Uint8Array,
    private readonly keyId: string
  ) {
    if (key.byteLength !== 32) throw new Error("Credential master key must be 32 bytes.");
    if (!keyId) throw new Error("Credential key id is required.");
    this.cryptoKey = crypto.subtle.importKey("raw", Uint8Array.from(key), "AES-GCM", false, [
      "encrypt",
      "decrypt"
    ]);
  }

  async protect(secret: string, context: SecretContext): Promise<ProtectedSecret> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { additionalData: associatedData(context, this.keyId), iv: nonce, name: "AES-GCM" },
        await this.cryptoKey,
        new TextEncoder().encode(secret)
      )
    );
    const tagOffset = encrypted.byteLength - 16;
    return {
      authTag: encrypted.slice(tagOffset),
      ciphertext: encrypted.slice(0, tagOffset),
      encryptionVersion: ENCRYPTION_VERSION,
      keyId: this.keyId,
      nonce
    };
  }

  async unprotect(secret: ProtectedSecret, context: SecretContext): Promise<string> {
    if (secret.encryptionVersion !== ENCRYPTION_VERSION || secret.keyId !== this.keyId) {
      throw new Error("Protected secret key version is unavailable.");
    }
    const combined = new Uint8Array(secret.ciphertext.byteLength + secret.authTag.byteLength);
    combined.set(secret.ciphertext);
    combined.set(secret.authTag, secret.ciphertext.byteLength);
    const decrypted = await crypto.subtle.decrypt(
      {
        additionalData: associatedData(context, secret.keyId),
        iv: Uint8Array.from(secret.nonce),
        name: "AES-GCM"
      },
      await this.cryptoKey,
      combined
    );
    return new TextDecoder().decode(decrypted);
  }
}

export function decodeBase64UrlKey(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function associatedData(context: SecretContext, keyId: string) {
  return new TextEncoder().encode(
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

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
