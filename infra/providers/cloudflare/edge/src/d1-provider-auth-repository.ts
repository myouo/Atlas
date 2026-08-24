import type {
  CreateProviderAuthAttemptInput,
  ProviderAuthAttemptRepository
} from "@nivalis/application";
import type { ProtectedSecret, ProviderAuthAttemptRecord } from "@nivalis/domain";

const ACTIVE_STATUSES = [
  "queued",
  "preparing",
  "waiting_for_scan",
  "waiting_for_confirmation",
  "waiting_for_code",
  "verifying"
] as const;
const ACTIVE_SQL = ACTIVE_STATUSES.map(() => "?").join(", ");

interface AttemptRow {
  readonly created_at: string;
  readonly encryption_version: number | null;
  readonly expires_at: string;
  readonly failure_count: number;
  readonly finished_at: string | null;
  readonly id: string;
  readonly key_id: string | null;
  readonly last_error_code: string | null;
  readonly last_error_message: string | null;
  readonly lease_expires_at: string | null;
  readonly masked_phone: string | null;
  readonly method: ProviderAuthAttemptRecord["method"];
  readonly operation: ProviderAuthAttemptRecord["operation"];
  readonly owner_id: string;
  readonly provider: "netease";
  readonly resend_after: string | null;
  readonly secret_auth_tag: ArrayBuffer | null;
  readonly secret_ciphertext: ArrayBuffer | null;
  readonly secret_nonce: ArrayBuffer | null;
  readonly status: ProviderAuthAttemptRecord["status"];
  readonly updated_at: string;
}

export class D1ProviderAuthAttemptRepository implements ProviderAuthAttemptRepository {
  constructor(private readonly database: D1Database) {}

  async createOrGetActive(input: CreateProviderAuthAttemptInput) {
    await this.database
      .prepare(
        `UPDATE provider_auth_attempts
            SET status = 'expired',
                finished_at = ?, updated_at = ?, lease_expires_at = NULL,
                secret_ciphertext = NULL, secret_nonce = NULL, secret_auth_tag = NULL,
                encryption_version = NULL, key_id = NULL
          WHERE owner_id = ? AND provider = 'netease'
            AND status IN (${ACTIVE_SQL}) AND expires_at <= ?`
      )
      .bind(
        input.createdAt.toISOString(),
        input.createdAt.toISOString(),
        input.ownerId,
        ...ACTIVE_STATUSES,
        input.createdAt.toISOString()
      )
      .run();
    const existing = await this.findActiveForOwner(input.ownerId);
    if (existing) return { attempt: existing, created: false };
    const state = envelope(input.protectedState);
    try {
      await this.database
        .prepare(
          `INSERT INTO provider_auth_attempts
            (id, owner_id, provider, method, operation, status, masked_phone,
             secret_ciphertext, secret_nonce, secret_auth_tag, encryption_version, key_id,
             failure_count, lease_expires_at, resend_after, last_error_code,
             last_error_message, created_at, updated_at, expires_at, finished_at)
           VALUES (?, ?, 'netease', ?, ?, 'queued', ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, ?, ?, ?, NULL)`
        )
        .bind(
          input.id,
          input.ownerId,
          input.method,
          input.operation,
          input.maskedPhone,
          state.ciphertext,
          state.nonce,
          state.authTag,
          state.encryptionVersion,
          state.keyId,
          input.createdAt.toISOString(),
          input.createdAt.toISOString(),
          input.expiresAt.toISOString()
        )
        .run();
      const created = await this.requireAttempt(input.id);
      return { attempt: created, created: true };
    } catch {
      const raced = await this.findActiveForOwner(input.ownerId);
      if (raced) return { attempt: raced, created: false };
      throw new Error("Provider AuthAttempt deduplication failed.");
    }
  }

  get(attemptId: string) {
    return this.find("id = ?", [attemptId]);
  }

  getForOwner(ownerId: string, attemptId: string) {
    return this.find("id = ? AND owner_id = ?", [attemptId, ownerId]);
  }

  async beginCompletion(attemptId: string, now: Date) {
    return this.updateReturning(
      `status = 'verifying', updated_at = ?`,
      [now.toISOString()],
      `id = ? AND status IN ('preparing', 'waiting_for_scan', 'waiting_for_confirmation', 'verifying') AND expires_at > ?`,
      [attemptId, now.toISOString()]
    );
  }

  async cancelForOwner(ownerId: string, attemptId: string, now: Date) {
    return this.updateReturning(
      terminalSet("failed"),
      terminalValues(
        now,
        "provider-auth-cancelled",
        "The Owner cancelled the Provider authentication attempt."
      ),
      `id = ? AND owner_id = ? AND status IN ('queued', 'waiting_for_scan', 'waiting_for_confirmation', 'waiting_for_code') AND lease_expires_at IS NULL`,
      [attemptId, ownerId]
    );
  }

  async cancelActiveForOwner(ownerId: string, now: Date) {
    const result = await this.database
      .prepare(
        `UPDATE provider_auth_attempts SET ${terminalSet("failed")}
          WHERE owner_id = ? AND provider = 'netease' AND status IN (${ACTIVE_SQL})`
      )
      .bind(
        ...terminalValues(
          now,
          "provider-auth-disconnected",
          "The Owner disconnected the Provider connection."
        ),
        ownerId,
        ...ACTIVE_STATUSES
      )
      .run();
    return result.meta.changes;
  }

  async claim(attemptId: string, now: Date, leaseExpiresAt: Date) {
    return this.updateReturning(
      `lease_expires_at = ?,
       status = CASE operation
         WHEN 'qr_prepare' THEN 'preparing'
         WHEN 'sms_send' THEN 'preparing'
         WHEN 'sms_verify' THEN 'verifying'
         ELSE status END,
       updated_at = ?`,
      [leaseExpiresAt.toISOString(), now.toISOString()],
      `id = ? AND status IN ('queued', 'waiting_for_scan', 'waiting_for_confirmation')
       AND expires_at > ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      [attemptId, now.toISOString(), now.toISOString()]
    );
  }

  markQrPrepared(input: {
    readonly attemptId: string;
    readonly now: Date;
    readonly protectedState: ProtectedSecret;
  }) {
    const state = envelope(input.protectedState);
    return this.transition(
      input.attemptId,
      `secret_ciphertext = ?, secret_nonce = ?, secret_auth_tag = ?,
       encryption_version = ?, key_id = ?, failure_count = 0,
       last_error_code = NULL, last_error_message = NULL, lease_expires_at = NULL,
       operation = 'qr_poll', status = 'waiting_for_scan', updated_at = ?`,
      [
        state.ciphertext,
        state.nonce,
        state.authTag,
        state.encryptionVersion,
        state.keyId,
        input.now.toISOString()
      ],
      ["preparing"]
    );
  }

  markQrWaiting(
    attemptId: string,
    status: "waiting_for_confirmation" | "waiting_for_scan",
    now: Date
  ) {
    return this.transition(
      attemptId,
      `failure_count = 0, last_error_code = NULL, last_error_message = NULL,
       lease_expires_at = NULL, status = ?, updated_at = ?`,
      [status, now.toISOString()],
      ["waiting_for_scan", "waiting_for_confirmation"]
    );
  }

  markSmsCodeSent(attemptId: string, resendAfter: Date, now: Date) {
    return this.transition(
      attemptId,
      `failure_count = 0, last_error_code = NULL, last_error_message = NULL,
       lease_expires_at = NULL, operation = 'sms_verify', resend_after = ?,
       status = 'waiting_for_code', updated_at = ?`,
      [resendAfter.toISOString(), now.toISOString()],
      ["preparing"]
    );
  }

  async queueSmsVerification(
    ownerId: string,
    attemptId: string,
    protectedState: ProtectedSecret,
    now: Date
  ) {
    const state = envelope(protectedState);
    return this.updateReturning(
      `secret_ciphertext = ?, secret_nonce = ?, secret_auth_tag = ?,
       encryption_version = ?, key_id = ?, failure_count = 0,
       last_error_code = NULL, last_error_message = NULL, lease_expires_at = NULL,
       operation = 'sms_verify', status = 'queued', updated_at = ?`,
      [
        state.ciphertext,
        state.nonce,
        state.authTag,
        state.encryptionVersion,
        state.keyId,
        now.toISOString()
      ],
      `id = ? AND owner_id = ? AND method = 'sms_otp' AND status = 'waiting_for_code' AND expires_at > ?`,
      [attemptId, ownerId, now.toISOString()]
    );
  }

  async markRetry(attemptId: string, errorCode: string, errorMessage: string, now: Date) {
    return this.transition(
      attemptId,
      `failure_count = failure_count + 1, last_error_code = ?, last_error_message = ?,
       lease_expires_at = NULL, status = 'queued', updated_at = ?`,
      [errorCode, safeMessage(errorMessage), now.toISOString()]
    );
  }

  markConnected(attemptId: string, now: Date) {
    return this.terminal(attemptId, "connected", null, null, now, ["verifying"]);
  }

  markExpired(attemptId: string, now: Date) {
    return this.terminal(attemptId, "expired", null, null, now);
  }

  markFailed(attemptId: string, errorCode: string, errorMessage: string, now: Date) {
    return this.terminal(attemptId, "failed", errorCode, safeMessage(errorMessage), now);
  }

  findActiveForOwner(ownerId: string) {
    return this.find(
      `owner_id = ? AND provider = 'netease' AND status IN (${ACTIVE_SQL}) ORDER BY created_at DESC LIMIT 1`,
      [ownerId, ...ACTIVE_STATUSES]
    );
  }

  private async terminal(
    attemptId: string,
    status: "connected" | "expired" | "failed",
    errorCode: string | null,
    errorMessage: string | null,
    now: Date,
    expectedStatuses: readonly ProviderAuthAttemptRecord["status"][] = ACTIVE_STATUSES
  ) {
    return this.transition(
      attemptId,
      terminalSet(status),
      terminalValues(now, errorCode, errorMessage),
      expectedStatuses
    );
  }

  private async transition(
    attemptId: string,
    setSql: string,
    setValues: readonly unknown[],
    expectedStatuses: readonly ProviderAuthAttemptRecord["status"][] = ACTIVE_STATUSES
  ) {
    const placeholders = expectedStatuses.map(() => "?").join(", ");
    const row = await this.updateReturning(
      setSql,
      setValues,
      `id = ? AND status IN (${placeholders})`,
      [attemptId, ...expectedStatuses]
    );
    return row ?? this.requireAttempt(attemptId);
  }

  private async updateReturning(
    setSql: string,
    setValues: readonly unknown[],
    whereSql: string,
    whereValues: readonly unknown[]
  ) {
    const row = await this.database
      .prepare(`UPDATE provider_auth_attempts SET ${setSql} WHERE ${whereSql} RETURNING *`)
      .bind(...setValues, ...whereValues)
      .first<AttemptRow>();
    return row ? mapAttempt(row) : null;
  }

  private async find(whereSql: string, values: readonly unknown[]) {
    const row = await this.database
      .prepare(`SELECT * FROM provider_auth_attempts WHERE ${whereSql}`)
      .bind(...values)
      .first<AttemptRow>();
    return row ? mapAttempt(row) : null;
  }

  private async requireAttempt(attemptId: string) {
    const attempt = await this.get(attemptId);
    if (!attempt) throw new Error("Provider AuthAttempt disappeared during transition.");
    return attempt;
  }
}

function mapAttempt(row: AttemptRow): ProviderAuthAttemptRecord {
  return {
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    failureCount: row.failure_count,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    id: row.id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at) : null,
    maskedPhone: row.masked_phone,
    method: row.method,
    operation: row.operation,
    ownerId: row.owner_id,
    protectedState: protectedState(row),
    provider: row.provider,
    qrUrl: null,
    resendAfter: row.resend_after ? new Date(row.resend_after) : null,
    status: row.status,
    updatedAt: new Date(row.updated_at)
  };
}

function protectedState(row: AttemptRow): ProtectedSecret | null {
  if (
    row.secret_ciphertext === null ||
    row.secret_nonce === null ||
    row.secret_auth_tag === null ||
    row.encryption_version === null ||
    row.key_id === null
  ) {
    return null;
  }
  return {
    authTag: new Uint8Array(row.secret_auth_tag),
    ciphertext: new Uint8Array(row.secret_ciphertext),
    encryptionVersion: row.encryption_version,
    keyId: row.key_id,
    nonce: new Uint8Array(row.secret_nonce)
  };
}

function envelope(state: ProtectedSecret | null) {
  return state
    ? {
        authTag: state.authTag,
        ciphertext: state.ciphertext,
        encryptionVersion: state.encryptionVersion,
        keyId: state.keyId,
        nonce: state.nonce
      }
    : { authTag: null, ciphertext: null, encryptionVersion: null, keyId: null, nonce: null };
}

function terminalSet(status: "connected" | "expired" | "failed") {
  return `status = '${status}', finished_at = ?, updated_at = ?, lease_expires_at = NULL,
          last_error_code = ?, last_error_message = ?,
          secret_ciphertext = NULL, secret_nonce = NULL, secret_auth_tag = NULL,
          encryption_version = NULL, key_id = NULL`;
}

function terminalValues(now: Date, errorCode: string | null, errorMessage: string | null) {
  return [now.toISOString(), now.toISOString(), errorCode, errorMessage];
}

function safeMessage(message: string) {
  return message.slice(0, 500);
}
