import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { AuthTokenFactory } from "@nivalis/application";

export class CryptoAuthTokenFactory implements AuthTokenFactory {
  createOpaqueToken(bytes: number) {
    return randomBytes(bytes).toString("base64url");
  }

  createPkceChallenge(verifier: string) {
    return createHash("sha256").update(verifier).digest("base64url");
  }

  hashOpaqueToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  createUuid() {
    return randomUUID();
  }
}
