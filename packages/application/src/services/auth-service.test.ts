import { ForbiddenError, UnauthenticatedError } from "@nivalis/domain";
import type { Actor, AuthenticatedSession, ExternalIdentity } from "@nivalis/domain";
import { describe, expect, it, vi } from "vitest";

import type { AuthRepository, AuthStateRecord } from "../ports/auth";
import type { SecretContext, SecretProtector } from "../ports/credentials";
import { AuthService } from "./auth-service";

const now = new Date("2026-08-24T04:00:00.000Z");

describe("AuthService", () => {
  it("uses one-time OAuth state + PKCE and issues an opaque owner session", async () => {
    const repository = new MemoryAuthRepository();
    const oauth = {
      createAuthorizationUrl: vi.fn(
        ({ codeChallenge, state }: { readonly codeChallenge: string; readonly state: string }) =>
          `https://identity.invalid/authorize?state=${state}&challenge=${codeChallenge}`
      ),
      exchangeCode: vi.fn(async () => ({ provider: "github" as const, subject: "1000001" }))
    };
    let tokens = 0;
    const service = new AuthService(
      repository,
      oauth,
      {
        createOpaqueToken: () => `opaque-${++tokens}`,
        createPkceChallenge: (value) => `challenge:${value}`,
        createUuid: () => "00000000-0000-4000-8000-000000000099",
        hashOpaqueToken: (value) => `hash:${value}`
      },
      new MemorySecretProtector(),
      { now: () => now },
      {
        oauthStateTtlMs: 600_000,
        ownerActorId: "00000000-0000-4000-8000-000000000001",
        ownerGithubUserId: "1000001",
        sessionTtlMs: 86_400_000
      }
    );

    const started = await service.startGithubAuthentication();
    expect(started.authorizationUrl).toContain("state=opaque-1");
    expect(started.authorizationUrl).toContain("challenge=challenge:opaque-2");
    const issued = await service.completeGithubAuthentication("code", "opaque-1");
    expect(issued.token).toBe("opaque-3");
    await expect(service.requireOwner(issued.token)).resolves.toEqual({
      actorId: "00000000-0000-4000-8000-000000000001"
    });
    await expect(service.completeGithubAuthentication("code", "opaque-1")).rejects.toThrow(
      /OAuth transaction/i
    );
  });

  it("distinguishes unauthenticated and authenticated non-owner callers", async () => {
    const repository = new MemoryAuthRepository();
    const service = new AuthService(
      repository,
      {
        createAuthorizationUrl: () => "https://identity.invalid",
        exchangeCode: async () => ({ provider: "github", subject: "viewer" })
      },
      {
        createOpaqueToken: () => "viewer-session",
        createPkceChallenge: (value) => value,
        createUuid: () => "00000000-0000-4000-8000-000000000098",
        hashOpaqueToken: (value) => `hash:${value}`
      },
      new MemorySecretProtector(),
      { now: () => now },
      {
        oauthStateTtlMs: 600_000,
        ownerActorId: "00000000-0000-4000-8000-000000000001",
        ownerGithubUserId: "1000001",
        sessionTtlMs: 86_400_000
      }
    );
    await expect(service.requireOwner(null)).rejects.toBeInstanceOf(UnauthenticatedError);
    repository.sessions.set("hash:viewer-session", {
      actor: { id: "00000000-0000-4000-8000-000000000002", role: "viewer" },
      expiresAt: new Date(now.getTime() + 10_000),
      id: "00000000-0000-4000-8000-000000000098"
    });
    await expect(service.requireOwner("viewer-session")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

class MemoryAuthRepository implements AuthRepository {
  readonly states = new Map<string, AuthStateRecord>();
  readonly sessions = new Map<string, AuthenticatedSession>();

  async saveState(state: AuthStateRecord) {
    this.states.set(state.stateHash, state);
  }

  async consumeState(stateHash: string) {
    const value = this.states.get(stateHash) ?? null;
    this.states.delete(stateHash);
    return value;
  }

  async upsertActorForIdentity(input: {
    readonly identity: ExternalIdentity;
    readonly isOwner: boolean;
    readonly ownerActorId: string;
  }): Promise<Actor> {
    return {
      id: input.isOwner ? input.ownerActorId : "00000000-0000-4000-8000-000000000002",
      role: input.isOwner ? "owner" : "viewer"
    };
  }

  async createSession(input: {
    readonly actorId: string;
    readonly expiresAt: Date;
    readonly id: string;
    readonly tokenHash: string;
  }) {
    this.sessions.set(input.tokenHash, {
      actor: { id: input.actorId, role: "owner" },
      expiresAt: input.expiresAt,
      id: input.id
    });
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}

class MemorySecretProtector implements SecretProtector {
  async protect(secret: string) {
    return {
      authTag: new Uint8Array(16),
      ciphertext: Buffer.from(secret),
      encryptionVersion: 1,
      keyId: "test",
      nonce: new Uint8Array(12)
    };
  }

  async unprotect(
    secret: Awaited<ReturnType<MemorySecretProtector["protect"]>>,
    _context: SecretContext
  ) {
    void _context;
    await Promise.resolve();
    return Buffer.from(secret.ciphertext).toString("utf8");
  }
}
