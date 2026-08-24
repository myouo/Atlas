import { randomUUID } from "node:crypto";

import type {
  ProviderConnectionRepository,
  ProviderConnectionUnitOfWork,
  ProviderCredentialResolver,
  ProviderCredentialStore,
  SecretProtector
} from "@nivalis/application";
import { ProviderAuthAttemptStateError, ProviderCredentialError } from "@nivalis/domain";
import type {
  CredentialStatus,
  ProtectedSecret,
  ProviderConnectionView,
  ProviderCredentialRecord,
  ProviderCredentialType
} from "@nivalis/domain";
import type { Kysely, Transaction } from "kysely";

import type { Database } from "../database/schema";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export class KyselyProviderCredentialRepository
  implements ProviderConnectionRepository, ProviderCredentialStore
{
  constructor(private readonly database: DatabaseExecutor) {}

  async upsertForOwner(input: {
    readonly acquiredFromAttemptAt?: Date;
    readonly now: Date;
    readonly ownerId: string;
  }) {
    const existing = await this.database
      .selectFrom("provider_connections")
      .select(["id", "enabled", "updated_at"])
      .where("owner_id", "=", input.ownerId)
      .where("provider", "=", "netease")
      .orderBy("created_at", "asc")
      .forUpdate()
      .executeTakeFirst();
    if (existing) {
      if (
        input.acquiredFromAttemptAt &&
        !existing.enabled &&
        existing.updated_at > input.acquiredFromAttemptAt
      ) {
        throw new ProviderAuthAttemptStateError(
          "The Provider connection was disconnected after this login attempt started."
        );
      }
      await this.database
        .updateTable("provider_connections")
        .set({ enabled: true, updated_at: input.now })
        .where("id", "=", existing.id)
        .execute();
      return existing;
    }
    const id = randomUUID();
    await this.database
      .insertInto("provider_connections")
      .values({
        account_key: "pending-validation",
        created_at: input.now,
        enabled: true,
        id,
        owner_id: input.ownerId,
        provider: "netease",
        updated_at: input.now
      })
      .execute();
    await this.database
      .insertInto("provider_sync_states")
      .values({
        attempt_count: 0,
        last_attempt_at: null,
        last_error_at: null,
        last_error_code: null,
        last_error_message: null,
        last_success_at: null,
        last_successful_run_id: null,
        provider: "netease",
        provider_connection_id: id,
        status: "idle",
        updated_at: input.now
      })
      .execute();
    return { id };
  }

  async disableForOwner(ownerId: string, provider: "netease", now: Date) {
    const result = await this.database
      .updateTable("provider_connections")
      .set({ enabled: false, updated_at: now })
      .where("owner_id", "=", ownerId)
      .where("provider", "=", provider)
      .where("enabled", "=", true)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async getForOwner(ownerId: string, provider: "netease"): Promise<ProviderConnectionView> {
    const row = await this.database
      .selectFrom("provider_connections as connection")
      .leftJoin(
        "provider_credentials as credential",
        "credential.provider_connection_id",
        "connection.id"
      )
      .leftJoin("netease_accounts as account", "account.provider_connection_id", "connection.id")
      .select([
        "connection.enabled",
        "credential.status as credential_status",
        "credential.updated_at as credential_updated_at",
        "credential.validated_at",
        "account.provider_user_id",
        "account.display_name"
      ])
      .where("connection.owner_id", "=", ownerId)
      .where("connection.provider", "=", provider)
      .orderBy("connection.created_at", "asc")
      .executeTakeFirst();
    const configured = row?.credential_status !== null && row?.credential_status !== undefined;
    return row
      ? {
          configured,
          credentialStatus: row.credential_status ?? "not_configured",
          credentialUpdatedAt: row.credential_updated_at,
          displayName: configured && row.enabled ? row.display_name : null,
          enabled: row.enabled,
          lastValidatedAt: row.validated_at,
          provider: "netease",
          providerAccountId: configured && row.enabled ? row.provider_user_id : null
        }
      : emptyConnection();
  }

  async listForOwner(ownerId: string) {
    return [await this.getForOwner(ownerId, "netease")];
  }

  async save(input: {
    readonly credentialType: ProviderCredentialType;
    readonly now: Date;
    readonly protectedSecret: ProtectedSecret;
    readonly providerConnectionId: string;
    readonly status: Exclude<CredentialStatus, "not_configured">;
  }): Promise<ProviderCredentialRecord> {
    const id = randomUUID();
    const row = await this.database
      .insertInto("provider_credentials")
      .values({
        auth_tag: input.protectedSecret.authTag,
        ciphertext: input.protectedSecret.ciphertext,
        created_at: input.now,
        credential_type: input.credentialType,
        encryption_version: input.protectedSecret.encryptionVersion,
        id,
        key_id: input.protectedSecret.keyId,
        nonce: input.protectedSecret.nonce,
        provider_connection_id: input.providerConnectionId,
        status: input.status,
        updated_at: input.now,
        validated_at: null
      })
      .onConflict((conflict) =>
        conflict.columns(["provider_connection_id", "credential_type"]).doUpdateSet({
          auth_tag: input.protectedSecret.authTag,
          ciphertext: input.protectedSecret.ciphertext,
          encryption_version: input.protectedSecret.encryptionVersion,
          key_id: input.protectedSecret.keyId,
          nonce: input.protectedSecret.nonce,
          status: input.status,
          updated_at: input.now,
          validated_at: null
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapCredential(row);
  }

  async get(providerConnectionId: string, credentialType: ProviderCredentialType) {
    const row = await this.database
      .selectFrom("provider_credentials")
      .selectAll()
      .where("provider_connection_id", "=", providerConnectionId)
      .where("credential_type", "=", credentialType)
      .executeTakeFirst();
    return row ? mapCredential(row) : null;
  }

  async delete(providerConnectionId: string, credentialType: ProviderCredentialType) {
    await this.database
      .deleteFrom("provider_credentials")
      .where("provider_connection_id", "=", providerConnectionId)
      .where("credential_type", "=", credentialType)
      .execute();
  }

  async updateStatus(
    providerConnectionId: string,
    credentialType: ProviderCredentialType,
    status: CredentialStatus,
    now: Date
  ) {
    if (status === "not_configured") return;
    await this.database
      .updateTable("provider_credentials")
      .set({ status, updated_at: now, ...(status === "valid" ? { validated_at: now } : {}) })
      .where("provider_connection_id", "=", providerConnectionId)
      .where("credential_type", "=", credentialType)
      .execute();
  }
}

export class KyselyProviderConnectionUnitOfWork implements ProviderConnectionUnitOfWork {
  constructor(private readonly database: Kysely<Database>) {}

  run<T>(
    work: (
      connections: ProviderConnectionRepository,
      credentials: ProviderCredentialStore
    ) => Promise<T>
  ) {
    return this.database.transaction().execute((transaction) => {
      const repository = new KyselyProviderCredentialRepository(transaction);
      return work(repository, repository);
    });
  }
}

export class KyselyProviderCredentialResolver implements ProviderCredentialResolver {
  constructor(
    private readonly database: DatabaseExecutor,
    private readonly protector: SecretProtector
  ) {}

  async resolve(providerConnectionId: string, credentialType: ProviderCredentialType) {
    const connection = await this.database
      .selectFrom("provider_connections")
      .select(["owner_id", "enabled"])
      .where("id", "=", providerConnectionId)
      .executeTakeFirst();
    if (!connection?.enabled) throw new ProviderCredentialError("invalid");
    const repository = new KyselyProviderCredentialRepository(this.database);
    const credential = await repository.get(providerConnectionId, credentialType);
    if (!credential) throw new ProviderCredentialError("invalid");
    try {
      return await this.protector.unprotect(credential, {
        credentialType,
        ownerId: connection.owner_id,
        purpose: "provider_credential",
        subjectId: providerConnectionId
      });
    } catch {
      throw new ProviderCredentialError("invalid");
    }
  }
}

function emptyConnection(): ProviderConnectionView {
  return {
    configured: false,
    credentialStatus: "not_configured",
    credentialUpdatedAt: null,
    displayName: null,
    enabled: false,
    lastValidatedAt: null,
    provider: "netease",
    providerAccountId: null
  };
}

function mapCredential(row: {
  readonly auth_tag: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly created_at: Date;
  readonly credential_type: "music_u";
  readonly encryption_version: number;
  readonly key_id: string;
  readonly nonce: Uint8Array;
  readonly provider_connection_id: string;
  readonly status: Exclude<CredentialStatus, "not_configured">;
  readonly updated_at: Date;
}): ProviderCredentialRecord {
  return {
    authTag: row.auth_tag,
    ciphertext: row.ciphertext,
    createdAt: row.created_at,
    credentialType: row.credential_type,
    encryptionVersion: row.encryption_version,
    keyId: row.key_id,
    nonce: row.nonce,
    providerConnectionId: row.provider_connection_id,
    status: row.status,
    updatedAt: row.updated_at
  };
}
