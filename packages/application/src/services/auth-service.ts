import {
  ExternalAuthenticationError,
  ForbiddenError,
  InvalidAuthTransactionError,
  UnauthenticatedError
} from "@nivalis/domain";
import type { AuthenticatedSession, OwnerContext } from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { SecretProtector } from "../ports/credentials";
import type { AuthRepository, AuthTokenFactory, OAuthIdentityProvider } from "../ports/auth";

export interface AuthServiceOptions {
  readonly oauthStateTtlMs: number;
  readonly ownerActorId: string;
  readonly ownerGithubUserId: string;
  readonly sessionTtlMs: number;
}

export interface IssuedSession {
  readonly expiresAt: Date;
  readonly token: string;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly oauth: OAuthIdentityProvider,
    private readonly tokens: AuthTokenFactory,
    private readonly secrets: SecretProtector,
    private readonly clock: Clock,
    private readonly options: AuthServiceOptions
  ) {}

  async startGithubAuthentication() {
    const now = this.clock.now();
    const state = this.tokens.createOpaqueToken(32);
    const stateHash = await this.tokens.hashOpaqueToken(state);
    const codeVerifier = this.tokens.createOpaqueToken(48);
    const protectedCodeVerifier = await this.secrets.protect(codeVerifier, {
      credentialType: "pkce_verifier",
      ownerId: this.options.ownerActorId,
      purpose: "oauth_pkce",
      subjectId: stateHash
    });
    const expiresAt = new Date(now.getTime() + this.options.oauthStateTtlMs);
    await this.repository.saveState({
      createdAt: now,
      expiresAt,
      protectedCodeVerifier,
      stateHash
    });
    return {
      authorizationUrl: this.oauth.createAuthorizationUrl({
        codeChallenge: await this.tokens.createPkceChallenge(codeVerifier),
        state
      }),
      expiresAt
    };
  }

  async completeGithubAuthentication(code: string, state: string): Promise<IssuedSession> {
    const now = this.clock.now();
    const stateHash = await this.tokens.hashOpaqueToken(state);
    const transaction = await this.repository.consumeState(stateHash, now);
    if (!transaction) throw new InvalidAuthTransactionError();
    let codeVerifier: string;
    try {
      codeVerifier = await this.secrets.unprotect(transaction.protectedCodeVerifier, {
        credentialType: "pkce_verifier",
        ownerId: this.options.ownerActorId,
        purpose: "oauth_pkce",
        subjectId: stateHash
      });
    } catch {
      throw new InvalidAuthTransactionError();
    }

    let identity;
    try {
      identity = await this.oauth.exchangeCode({ code, codeVerifier });
    } catch {
      throw new ExternalAuthenticationError();
    }
    const actor = await this.repository.upsertActorForIdentity({
      identity,
      isOwner: identity.subject === this.options.ownerGithubUserId,
      now,
      ownerActorId: this.options.ownerActorId
    });
    const token = this.tokens.createOpaqueToken(32);
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlMs);
    await this.repository.createSession({
      actorId: actor.id,
      createdAt: now,
      expiresAt,
      id: this.tokens.createUuid(),
      tokenHash: await this.tokens.hashOpaqueToken(token)
    });
    return { expiresAt, token };
  }

  async getSession(token: string | null): Promise<AuthenticatedSession | null> {
    if (!token) return Promise.resolve(null);
    return this.repository.findSessionByTokenHash(
      await this.tokens.hashOpaqueToken(token),
      this.clock.now()
    );
  }

  async requireOwner(token: string | null): Promise<OwnerContext> {
    const session = await this.getSession(token);
    if (!session) throw new UnauthenticatedError();
    if (session.actor.role !== "owner") throw new ForbiddenError();
    return { actorId: session.actor.id };
  }

  async logout(token: string | null): Promise<void> {
    if (!token) throw new UnauthenticatedError();
    await this.repository.revokeSession(await this.tokens.hashOpaqueToken(token), this.clock.now());
  }
}
