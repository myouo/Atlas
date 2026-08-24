import { randomUUID } from "node:crypto";

import type { AuthRepository, AuthStateRecord } from "@nivalis/application";
import type { Actor, AuthenticatedSession, ProtectedSecret } from "@nivalis/domain";
import type { Kysely, Transaction } from "kysely";

import type { Database } from "../database/schema";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export class KyselyAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async saveState(state: AuthStateRecord) {
    await this.database
      .insertInto("auth_oauth_states")
      .values({
        code_verifier_auth_tag: state.protectedCodeVerifier.authTag,
        code_verifier_ciphertext: state.protectedCodeVerifier.ciphertext,
        code_verifier_nonce: state.protectedCodeVerifier.nonce,
        consumed_at: null,
        created_at: state.createdAt,
        encryption_version: state.protectedCodeVerifier.encryptionVersion,
        expires_at: state.expiresAt,
        key_id: state.protectedCodeVerifier.keyId,
        state_hash: state.stateHash
      })
      .execute();
  }

  async consumeState(stateHash: string, now: Date): Promise<AuthStateRecord | null> {
    const row = await this.database
      .updateTable("auth_oauth_states")
      .set({ consumed_at: now })
      .where("state_hash", "=", stateHash)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", now)
      .returningAll()
      .executeTakeFirst();
    return row
      ? {
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          protectedCodeVerifier: protectedSecret(
            row.code_verifier_ciphertext,
            row.code_verifier_nonce,
            row.code_verifier_auth_tag,
            row.encryption_version,
            row.key_id
          ),
          stateHash: row.state_hash.trim()
        }
      : null;
  }

  async upsertActorForIdentity(input: {
    readonly identity: { readonly provider: "github"; readonly subject: string };
    readonly isOwner: boolean;
    readonly now: Date;
    readonly ownerActorId: string;
  }): Promise<Actor> {
    if (input.isOwner) {
      await this.database
        .insertInto("actors")
        .values({
          created_at: input.now,
          id: input.ownerActorId,
          role: "owner",
          updated_at: input.now
        })
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({ role: "owner", updated_at: input.now })
        )
        .execute();
      await this.upsertIdentity(input.ownerActorId, input.identity.subject, input.now);
      return { id: input.ownerActorId, role: "owner" };
    }

    const existing = await this.database
      .selectFrom("auth_identities as identity")
      .innerJoin("actors as actor", "actor.id", "identity.actor_id")
      .select(["actor.id", "actor.role"])
      .where("identity.provider", "=", "github")
      .where("identity.provider_subject", "=", input.identity.subject)
      .executeTakeFirst();
    if (existing) return { id: existing.id, role: existing.role };

    const actor: Actor = { id: randomUUID(), role: "viewer" };
    await this.database
      .insertInto("actors")
      .values({
        created_at: input.now,
        id: actor.id,
        role: actor.role,
        updated_at: input.now
      })
      .execute();
    await this.upsertIdentity(actor.id, input.identity.subject, input.now);
    return actor;
  }

  async createSession(input: {
    readonly actorId: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
    readonly id: string;
    readonly tokenHash: string;
  }) {
    await this.database
      .insertInto("auth_sessions")
      .values({
        actor_id: input.actorId,
        created_at: input.createdAt,
        expires_at: input.expiresAt,
        id: input.id,
        revoked_at: null,
        token_hash: input.tokenHash
      })
      .execute();
  }

  async findSessionByTokenHash(tokenHash: string, now: Date): Promise<AuthenticatedSession | null> {
    const row = await this.database
      .selectFrom("auth_sessions as session")
      .innerJoin("actors as actor", "actor.id", "session.actor_id")
      .select([
        "session.id as session_id",
        "session.expires_at",
        "actor.id as actor_id",
        "actor.role"
      ])
      .where("session.token_hash", "=", tokenHash)
      .where("session.revoked_at", "is", null)
      .where("session.expires_at", ">", now)
      .executeTakeFirst();
    return row
      ? {
          actor: { id: row.actor_id, role: row.role },
          expiresAt: row.expires_at,
          id: row.session_id
        }
      : null;
  }

  async revokeSession(tokenHash: string, now: Date) {
    await this.database
      .updateTable("auth_sessions")
      .set({ revoked_at: now })
      .where("token_hash", "=", tokenHash)
      .where("revoked_at", "is", null)
      .execute();
  }

  private async upsertIdentity(actorId: string, subject: string, now: Date) {
    await this.database
      .insertInto("auth_identities")
      .values({
        actor_id: actorId,
        created_at: now,
        id: randomUUID(),
        provider: "github",
        provider_subject: subject,
        updated_at: now
      })
      .onConflict((conflict) =>
        conflict.columns(["provider", "provider_subject"]).doUpdateSet({
          actor_id: actorId,
          updated_at: now
        })
      )
      .execute();
  }
}

function protectedSecret(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  authTag: Uint8Array,
  encryptionVersion: number,
  keyId: string
): ProtectedSecret {
  return { authTag, ciphertext, encryptionVersion, keyId, nonce };
}
