import type { AuthRepository, AuthStateRecord } from "@nivalis/application";
import type { Actor, AuthenticatedSession, ProtectedSecret } from "@nivalis/domain";

interface StateRow {
  readonly code_verifier_auth_tag: ArrayBuffer;
  readonly code_verifier_ciphertext: ArrayBuffer;
  readonly code_verifier_nonce: ArrayBuffer;
  readonly created_at: string;
  readonly encryption_version: number;
  readonly expires_at: string;
  readonly key_id: string;
  readonly state_hash: string;
}

interface ActorRow {
  readonly id: string;
  readonly role: Actor["role"];
}

interface SessionRow {
  readonly actor_id: string;
  readonly expires_at: string;
  readonly role: Actor["role"];
  readonly session_id: string;
}

export class D1AuthRepository implements AuthRepository {
  constructor(private readonly database: D1Database) {}

  async saveState(state: AuthStateRecord) {
    await this.database
      .prepare(
        `INSERT INTO auth_oauth_states
          (state_hash,
           code_verifier_ciphertext,
           code_verifier_nonce,
           code_verifier_auth_tag,
           encryption_version,
           key_id,
           created_at,
           expires_at,
           consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        state.stateHash,
        state.protectedCodeVerifier.ciphertext,
        state.protectedCodeVerifier.nonce,
        state.protectedCodeVerifier.authTag,
        state.protectedCodeVerifier.encryptionVersion,
        state.protectedCodeVerifier.keyId,
        state.createdAt.toISOString(),
        state.expiresAt.toISOString()
      )
      .run();
  }

  async consumeState(stateHash: string, now: Date): Promise<AuthStateRecord | null> {
    const row = await this.database
      .prepare(
        `UPDATE auth_oauth_states
            SET consumed_at = ?
          WHERE state_hash = ?
            AND consumed_at IS NULL
            AND expires_at > ?
        RETURNING state_hash,
                  code_verifier_ciphertext,
                  code_verifier_nonce,
                  code_verifier_auth_tag,
                  encryption_version,
                  key_id,
                  created_at,
                  expires_at`
      )
      .bind(now.toISOString(), stateHash, now.toISOString())
      .first<StateRow>();
    return row
      ? {
          createdAt: new Date(row.created_at),
          expiresAt: new Date(row.expires_at),
          protectedCodeVerifier: protectedSecret(row),
          stateHash: row.state_hash
        }
      : null;
  }

  async upsertActorForIdentity(input: {
    readonly identity: { readonly provider: "github"; readonly subject: string };
    readonly isOwner: boolean;
    readonly now: Date;
    readonly ownerActorId: string;
  }): Promise<Actor> {
    const timestamp = input.now.toISOString();
    if (input.isOwner) {
      await this.database.batch([
        this.database
          .prepare(
            `INSERT INTO actors (id, role, created_at, updated_at)
             VALUES (?, 'owner', ?, ?)
             ON CONFLICT(id) DO UPDATE SET role = 'owner', updated_at = excluded.updated_at`
          )
          .bind(input.ownerActorId, timestamp, timestamp),
        this.identityUpsert(input.ownerActorId, input.identity.subject, timestamp)
      ]);
      return { id: input.ownerActorId, role: "owner" };
    }

    const existing = await this.findActor(input.identity.subject);
    if (existing) return existing;
    const actor: Actor = { id: crypto.randomUUID(), role: "viewer" };
    try {
      await this.database.batch([
        this.database
          .prepare(
            `INSERT INTO actors (id, role, created_at, updated_at)
             VALUES (?, 'viewer', ?, ?)`
          )
          .bind(actor.id, timestamp, timestamp),
        this.identityUpsert(actor.id, input.identity.subject, timestamp)
      ]);
      return actor;
    } catch {
      const raced = await this.findActor(input.identity.subject);
      if (raced) return raced;
      throw new Error("GitHub actor could not be persisted.");
    }
  }

  async createSession(input: {
    readonly actorId: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
    readonly id: string;
    readonly tokenHash: string;
  }) {
    await this.database
      .prepare(
        `INSERT INTO auth_sessions
          (id, actor_id, token_hash, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        input.id,
        input.actorId,
        input.tokenHash,
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      )
      .run();
  }

  async findSessionByTokenHash(tokenHash: string, now: Date): Promise<AuthenticatedSession | null> {
    const row = await this.database
      .prepare(
        `SELECT session.id AS session_id,
                session.expires_at,
                actor.id AS actor_id,
                actor.role
           FROM auth_sessions AS session
           JOIN actors AS actor ON actor.id = session.actor_id
          WHERE session.token_hash = ?
            AND session.revoked_at IS NULL
            AND session.expires_at > ?`
      )
      .bind(tokenHash, now.toISOString())
      .first<SessionRow>();
    return row
      ? {
          actor: { id: row.actor_id, role: row.role },
          expiresAt: new Date(row.expires_at),
          id: row.session_id
        }
      : null;
  }

  async revokeSession(tokenHash: string, now: Date) {
    await this.database
      .prepare(
        `UPDATE auth_sessions
            SET revoked_at = ?
          WHERE token_hash = ?
            AND revoked_at IS NULL`
      )
      .bind(now.toISOString(), tokenHash)
      .run();
  }

  private async findActor(subject: string): Promise<Actor | null> {
    const row = await this.database
      .prepare(
        `SELECT actor.id, actor.role
           FROM auth_identities AS identity
           JOIN actors AS actor ON actor.id = identity.actor_id
          WHERE identity.provider = 'github'
            AND identity.provider_subject = ?`
      )
      .bind(subject)
      .first<ActorRow>();
    return row ? { id: row.id, role: row.role } : null;
  }

  private identityUpsert(actorId: string, subject: string, timestamp: string) {
    return this.database
      .prepare(
        `INSERT INTO auth_identities
          (id, actor_id, provider, provider_subject, created_at, updated_at)
         VALUES (?, ?, 'github', ?, ?, ?)
         ON CONFLICT(provider, provider_subject) DO UPDATE SET
           actor_id = excluded.actor_id,
           updated_at = excluded.updated_at`
      )
      .bind(crypto.randomUUID(), actorId, subject, timestamp, timestamp);
  }
}

function protectedSecret(row: StateRow): ProtectedSecret {
  return {
    authTag: new Uint8Array(row.code_verifier_auth_tag),
    ciphertext: new Uint8Array(row.code_verifier_ciphertext),
    encryptionVersion: row.encryption_version,
    keyId: row.key_id,
    nonce: new Uint8Array(row.code_verifier_nonce)
  };
}
