import type {
  Actor,
  AuthenticatedSession,
  ExternalIdentity,
  ProtectedSecret
} from "@nivalis/domain";

export interface AuthStateRecord {
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly protectedCodeVerifier: ProtectedSecret;
  readonly stateHash: string;
}

export interface AuthRepository {
  consumeState(stateHash: string, now: Date): Promise<AuthStateRecord | null>;
  createSession(input: {
    readonly actorId: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
    readonly id: string;
    readonly tokenHash: string;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string, now: Date): Promise<AuthenticatedSession | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  saveState(state: AuthStateRecord): Promise<void>;
  upsertActorForIdentity(input: {
    readonly identity: ExternalIdentity;
    readonly isOwner: boolean;
    readonly now: Date;
    readonly ownerActorId: string;
  }): Promise<Actor>;
}

export interface OAuthIdentityProvider {
  createAuthorizationUrl(input: { readonly codeChallenge: string; readonly state: string }): string;
  exchangeCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<ExternalIdentity>;
}

export interface AuthTokenFactory {
  createOpaqueToken(bytes: number): string;
  createPkceChallenge(verifier: string): string | Promise<string>;
  hashOpaqueToken(token: string): string | Promise<string>;
  createUuid(): string;
}
