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
  ProviderConnection,
  ProviderConnectionView,
  ProviderCredentialRecord,
  ProviderCredentialType
} from "@nivalis/domain";

interface ConnectionRow {
  readonly created_at: string;
  readonly enabled: number;
  readonly id: string;
  readonly owner_id: string;
  readonly updated_at: string;
}

interface ConnectionViewRow {
  readonly credential_status: Exclude<CredentialStatus, "not_configured"> | null;
  readonly credential_updated_at: string | null;
  readonly display_name: string | null;
  readonly enabled: number;
  readonly provider_user_id: string | null;
  readonly validated_at: string | null;
}

interface CredentialRow {
  readonly auth_tag: ArrayBuffer;
  readonly ciphertext: ArrayBuffer;
  readonly created_at: string;
  readonly credential_type: "music_u";
  readonly encryption_version: number;
  readonly key_id: string;
  readonly nonce: ArrayBuffer;
  readonly provider_connection_id: string;
  readonly status: Exclude<CredentialStatus, "not_configured">;
  readonly updated_at: string;
}

export class D1ProviderCredentialRepository
  implements ProviderConnectionRepository, ProviderCredentialStore
{
  constructor(private readonly database: D1Database) {}

  async upsertForOwner(input: {
    readonly acquiredFromAttemptAt?: Date;
    readonly now: Date;
    readonly ownerId: string;
  }) {
    const existing = await this.connectionForOwner(input.ownerId);
    const now = input.now.toISOString();
    if (existing) {
      if (
        input.acquiredFromAttemptAt &&
        existing.enabled === 0 &&
        new Date(existing.updated_at) > input.acquiredFromAttemptAt
      ) {
        throw new ProviderAuthAttemptStateError(
          "The Provider connection was disconnected after this login attempt started."
        );
      }
      await this.database
        .prepare("UPDATE provider_connections SET enabled = 1, updated_at = ? WHERE id = ?")
        .bind(now, existing.id)
        .run();
      return { id: existing.id };
    }

    const id = crypto.randomUUID();
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO provider_connections
            (id, owner_id, provider, account_key, enabled, created_at, updated_at)
           VALUES (?, ?, 'netease', 'pending-validation', 1, ?, ?)`
        )
        .bind(id, input.ownerId, now, now),
      this.database
        .prepare(
          `INSERT INTO provider_sync_states
            (provider_connection_id, provider, status, attempt_count, updated_at)
           VALUES (?, 'netease', 'idle', 0, ?)`
        )
        .bind(id, now)
    ]);
    return { id };
  }

  async disableForOwner(ownerId: string, provider: "netease", now: Date) {
    void provider;
    const result = await this.database
      .prepare(
        `UPDATE provider_connections
            SET enabled = 0, updated_at = ?
          WHERE owner_id = ? AND provider = 'netease' AND enabled = 1`
      )
      .bind(now.toISOString(), ownerId)
      .run();
    return result.meta.changes > 0;
  }

  async getForOwner(ownerId: string, provider: "netease"): Promise<ProviderConnectionView> {
    void provider;
    const row = await this.database
      .prepare(
        `SELECT connection.enabled,
                credential.status AS credential_status,
                credential.updated_at AS credential_updated_at,
                credential.validated_at,
                account.provider_user_id,
                account.display_name
           FROM provider_connections AS connection
           LEFT JOIN provider_credentials AS credential
             ON credential.provider_connection_id = connection.id
            AND credential.credential_type = 'music_u'
           LEFT JOIN netease_accounts AS account
             ON account.provider_connection_id = connection.id
          WHERE connection.owner_id = ? AND connection.provider = 'netease'`
      )
      .bind(ownerId)
      .first<ConnectionViewRow>();
    if (!row) return emptyConnection();
    const configured = row.credential_status !== null;
    const enabled = row.enabled === 1;
    return {
      configured,
      credentialStatus: row.credential_status ?? "not_configured",
      credentialUpdatedAt: row.credential_updated_at ? new Date(row.credential_updated_at) : null,
      displayName: configured && enabled ? row.display_name : null,
      enabled,
      lastValidatedAt: row.validated_at ? new Date(row.validated_at) : null,
      provider: "netease",
      providerAccountId: configured && enabled ? row.provider_user_id : null
    };
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
    const timestamp = input.now.toISOString();
    await this.database
      .prepare(
        `INSERT INTO provider_credentials
          (id, provider_connection_id, credential_type, ciphertext, nonce, auth_tag,
           encryption_version, key_id, status, created_at, updated_at, validated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(provider_connection_id, credential_type) DO UPDATE SET
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           auth_tag = excluded.auth_tag,
           encryption_version = excluded.encryption_version,
           key_id = excluded.key_id,
           status = excluded.status,
           updated_at = excluded.updated_at,
           validated_at = NULL`
      )
      .bind(
        crypto.randomUUID(),
        input.providerConnectionId,
        input.credentialType,
        input.protectedSecret.ciphertext,
        input.protectedSecret.nonce,
        input.protectedSecret.authTag,
        input.protectedSecret.encryptionVersion,
        input.protectedSecret.keyId,
        input.status,
        timestamp,
        timestamp
      )
      .run();
    const saved = await this.get(input.providerConnectionId, input.credentialType);
    if (!saved) throw new Error("Provider credential was not persisted.");
    return saved;
  }

  async get(providerConnectionId: string, credentialType: ProviderCredentialType) {
    const row = await this.database
      .prepare(
        `SELECT provider_connection_id, credential_type, ciphertext, nonce, auth_tag,
                encryption_version, key_id, status, created_at, updated_at
           FROM provider_credentials
          WHERE provider_connection_id = ? AND credential_type = ?`
      )
      .bind(providerConnectionId, credentialType)
      .first<CredentialRow>();
    return row ? mapCredential(row) : null;
  }

  async delete(providerConnectionId: string, credentialType: ProviderCredentialType) {
    await this.database
      .prepare(
        "DELETE FROM provider_credentials WHERE provider_connection_id = ? AND credential_type = ?"
      )
      .bind(providerConnectionId, credentialType)
      .run();
  }

  async updateStatus(
    providerConnectionId: string,
    credentialType: ProviderCredentialType,
    status: CredentialStatus,
    now: Date
  ) {
    if (status === "not_configured") return;
    await this.database
      .prepare(
        `UPDATE provider_credentials
            SET status = ?, updated_at = ?, validated_at = CASE WHEN ? = 'valid' THEN ? ELSE validated_at END
          WHERE provider_connection_id = ? AND credential_type = ?`
      )
      .bind(
        status,
        now.toISOString(),
        status,
        now.toISOString(),
        providerConnectionId,
        credentialType
      )
      .run();
  }

  async ownerForConnection(providerConnectionId: string) {
    return this.database
      .prepare("SELECT owner_id FROM provider_connections WHERE id = ? AND enabled = 1")
      .bind(providerConnectionId)
      .first<{ readonly owner_id: string }>();
  }

  async findEnabledConnectionForOwner(ownerId: string): Promise<ProviderConnection | null> {
    const row = await this.database
      .prepare(
        `SELECT id, owner_id, account_key, enabled
           FROM provider_connections
          WHERE owner_id = ? AND provider = 'netease' AND enabled = 1`
      )
      .bind(ownerId)
      .first<{
        readonly account_key: string;
        readonly enabled: number;
        readonly id: string;
        readonly owner_id: string;
      }>();
    return row
      ? {
          accountKey: row.account_key,
          enabled: row.enabled === 1,
          id: row.id,
          ownerId: row.owner_id,
          provider: "netease"
        }
      : null;
  }

  private connectionForOwner(ownerId: string) {
    return this.database
      .prepare(
        "SELECT id, owner_id, enabled, created_at, updated_at FROM provider_connections WHERE owner_id = ? AND provider = 'netease'"
      )
      .bind(ownerId)
      .first<ConnectionRow>();
  }
}

export class D1ProviderConnectionUnitOfWork implements ProviderConnectionUnitOfWork {
  constructor(private readonly database: D1Database) {}

  run<T>(
    work: (
      connections: ProviderConnectionRepository,
      credentials: ProviderCredentialStore
    ) => Promise<T>
  ) {
    const repository = new D1ProviderCredentialRepository(this.database);
    return work(repository, repository);
  }
}

export class D1ProviderCredentialResolver implements ProviderCredentialResolver {
  constructor(
    private readonly repository: D1ProviderCredentialRepository,
    private readonly protector: SecretProtector
  ) {}

  async resolve(providerConnectionId: string, credentialType: ProviderCredentialType) {
    const connection = await this.repository.ownerForConnection(providerConnectionId);
    if (!connection) throw new ProviderCredentialError("invalid");
    const credential = await this.repository.get(providerConnectionId, credentialType);
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

function mapCredential(row: CredentialRow): ProviderCredentialRecord {
  return {
    authTag: new Uint8Array(row.auth_tag),
    ciphertext: new Uint8Array(row.ciphertext),
    createdAt: new Date(row.created_at),
    credentialType: row.credential_type,
    encryptionVersion: row.encryption_version,
    keyId: row.key_id,
    nonce: new Uint8Array(row.nonce),
    providerConnectionId: row.provider_connection_id,
    status: row.status,
    updatedAt: new Date(row.updated_at)
  };
}
