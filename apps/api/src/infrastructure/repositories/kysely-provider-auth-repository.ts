import type {
  CreateProviderAuthAttemptInput,
  ProviderAuthAttemptRepository
} from "@nivalis/application";
import type { ProtectedSecret, ProviderAuthAttemptRecord } from "@nivalis/domain";
import { type Kysely, type Selectable, sql, type Transaction, type Updateable } from "kysely";

import type { Database, ProviderAuthAttemptsTable } from "../database/schema";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
const activeStatuses = [
  "queued",
  "preparing",
  "waiting_for_scan",
  "waiting_for_confirmation",
  "waiting_for_code",
  "verifying"
] as const;

export class KyselyProviderAuthAttemptRepository implements ProviderAuthAttemptRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async createOrGetActive(input: CreateProviderAuthAttemptInput) {
    await this.database
      .updateTable("provider_auth_attempts")
      .set({
        finished_at: input.createdAt,
        key_id: null,
        encryption_version: null,
        lease_expires_at: null,
        secret_auth_tag: null,
        secret_ciphertext: null,
        secret_nonce: null,
        status: "expired",
        updated_at: input.createdAt
      })
      .where("owner_id", "=", input.ownerId)
      .where("provider", "=", "netease")
      .where("status", "in", activeStatuses)
      .where("expires_at", "<=", input.createdAt)
      .execute();
    const existing = await this.findActiveForOwner(input.ownerId);
    if (existing) return { attempt: existing, created: false };
    const envelope = serializeProtectedState(input.protectedState);
    const inserted = await this.database
      .insertInto("provider_auth_attempts")
      .values({
        created_at: input.createdAt,
        encryption_version: envelope.encryption_version,
        expires_at: input.expiresAt,
        failure_count: 0,
        finished_at: null,
        id: input.id,
        key_id: envelope.key_id,
        last_error_code: null,
        last_error_message: null,
        lease_expires_at: null,
        masked_phone: input.maskedPhone,
        method: input.method,
        operation: input.operation,
        owner_id: input.ownerId,
        provider: "netease",
        resend_after: null,
        secret_auth_tag: envelope.secret_auth_tag,
        secret_ciphertext: envelope.secret_ciphertext,
        secret_nonce: envelope.secret_nonce,
        status: "queued",
        updated_at: input.createdAt
      })
      .onConflict((conflict) => conflict.doNothing())
      .returningAll()
      .executeTakeFirst();
    if (inserted) return { attempt: mapAttempt(inserted), created: true };
    const raced = await this.findActiveForOwner(input.ownerId);
    if (!raced) throw new Error("Provider AuthAttempt deduplication failed.");
    return { attempt: raced, created: false };
  }

  async get(attemptId: string) {
    const row = await this.database
      .selectFrom("provider_auth_attempts")
      .selectAll()
      .where("id", "=", attemptId)
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  async getForOwner(ownerId: string, attemptId: string) {
    const row = await this.database
      .selectFrom("provider_auth_attempts")
      .selectAll()
      .where("id", "=", attemptId)
      .where("owner_id", "=", ownerId)
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  async beginCompletion(attemptId: string, now: Date) {
    const row = await this.database
      .updateTable("provider_auth_attempts")
      .set({ status: "verifying", updated_at: now })
      .where("id", "=", attemptId)
      .where("status", "in", [
        "preparing",
        "waiting_for_scan",
        "waiting_for_confirmation",
        "verifying"
      ])
      .where("expires_at", ">", now)
      .returningAll()
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  async cancelForOwner(ownerId: string, attemptId: string, now: Date) {
    const row = await this.database
      .updateTable("provider_auth_attempts")
      .set({
        encryption_version: null,
        finished_at: now,
        key_id: null,
        last_error_code: "provider-auth-cancelled",
        last_error_message: "The Owner cancelled the Provider authentication attempt.",
        lease_expires_at: null,
        secret_auth_tag: null,
        secret_ciphertext: null,
        secret_nonce: null,
        status: "failed",
        updated_at: now
      })
      .where("id", "=", attemptId)
      .where("owner_id", "=", ownerId)
      .where("status", "in", [
        "queued",
        "waiting_for_scan",
        "waiting_for_confirmation",
        "waiting_for_code"
      ])
      .where("lease_expires_at", "is", null)
      .returningAll()
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  async cancelActiveForOwner(ownerId: string, now: Date) {
    const result = await this.database
      .updateTable("provider_auth_attempts")
      .set({
        encryption_version: null,
        finished_at: now,
        key_id: null,
        last_error_code: "provider-auth-disconnected",
        last_error_message: "The Owner disconnected the Provider connection.",
        lease_expires_at: null,
        secret_auth_tag: null,
        secret_ciphertext: null,
        secret_nonce: null,
        status: "failed",
        updated_at: now
      })
      .where("owner_id", "=", ownerId)
      .where("provider", "=", "netease")
      .where("status", "in", activeStatuses)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async claim(attemptId: string, now: Date, leaseExpiresAt: Date) {
    const row = await this.database
      .updateTable("provider_auth_attempts")
      .set({
        lease_expires_at: leaseExpiresAt,
        status: (expression) =>
          expression
            .case("operation")
            .when("qr_prepare")
            .then("preparing")
            .when("sms_send")
            .then("preparing")
            .when("sms_verify")
            .then("verifying")
            .else(expression.ref("status"))
            .end()
            .$castTo<ProviderAuthAttemptRecord["status"]>(),
        updated_at: now
      })
      .where("id", "=", attemptId)
      .where("status", "in", ["queued", "waiting_for_scan", "waiting_for_confirmation"])
      .where("expires_at", ">", now)
      .where((expression) =>
        expression.or([
          expression("lease_expires_at", "is", null),
          expression("lease_expires_at", "<=", now)
        ])
      )
      .returningAll()
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  markQrPrepared(input: {
    readonly attemptId: string;
    readonly now: Date;
    readonly protectedState: ProtectedSecret;
  }) {
    const envelope = serializeProtectedState(input.protectedState);
    return this.transition(
      input.attemptId,
      {
        ...envelope,
        failure_count: 0,
        last_error_code: null,
        last_error_message: null,
        lease_expires_at: null,
        operation: "qr_poll",
        status: "waiting_for_scan",
        updated_at: input.now
      },
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
      {
        failure_count: 0,
        last_error_code: null,
        last_error_message: null,
        lease_expires_at: null,
        status,
        updated_at: now
      },
      ["waiting_for_scan", "waiting_for_confirmation"]
    );
  }

  markSmsCodeSent(attemptId: string, resendAfter: Date, now: Date) {
    return this.transition(
      attemptId,
      {
        failure_count: 0,
        last_error_code: null,
        last_error_message: null,
        lease_expires_at: null,
        operation: "sms_verify",
        resend_after: resendAfter,
        status: "waiting_for_code",
        updated_at: now
      },
      ["preparing"]
    );
  }

  async queueSmsVerification(
    ownerId: string,
    attemptId: string,
    protectedState: ProtectedSecret,
    now: Date
  ) {
    const envelope = serializeProtectedState(protectedState);
    const row = await this.database
      .updateTable("provider_auth_attempts")
      .set({
        ...envelope,
        failure_count: 0,
        last_error_code: null,
        last_error_message: null,
        lease_expires_at: null,
        operation: "sms_verify",
        status: "queued",
        updated_at: now
      })
      .where("id", "=", attemptId)
      .where("owner_id", "=", ownerId)
      .where("method", "=", "sms_otp")
      .where("status", "=", "waiting_for_code")
      .where("expires_at", ">", now)
      .returningAll()
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  async markRetry(attemptId: string, errorCode: string, errorMessage: string, now: Date) {
    const row = await this.database
      .updateTable("provider_auth_attempts")
      .set({
        failure_count: sql<number>`failure_count + 1`,
        last_error_code: errorCode,
        last_error_message: safeMessage(errorMessage),
        lease_expires_at: null,
        status: "queued",
        updated_at: now
      })
      .where("id", "=", attemptId)
      .where("status", "in", activeStatuses)
      .returningAll()
      .executeTakeFirst();
    return row ? mapAttempt(row) : this.requireAttempt(attemptId);
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

  async findActiveForOwner(ownerId: string) {
    const row = await this.database
      .selectFrom("provider_auth_attempts")
      .selectAll()
      .where("owner_id", "=", ownerId)
      .where("provider", "=", "netease")
      .where("status", "in", activeStatuses)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  private async terminal(
    attemptId: string,
    status: "connected" | "expired" | "failed",
    errorCode: string | null,
    errorMessage: string | null,
    now: Date,
    expectedStatuses: readonly ProviderAuthAttemptRecord["status"][] = activeStatuses
  ) {
    return this.transition(
      attemptId,
      {
        encryption_version: null,
        finished_at: now,
        key_id: null,
        last_error_code: errorCode,
        last_error_message: errorMessage,
        lease_expires_at: null,
        secret_auth_tag: null,
        secret_ciphertext: null,
        secret_nonce: null,
        status,
        updated_at: now
      },
      expectedStatuses
    );
  }

  private async transition(
    attemptId: string,
    values: Updateable<ProviderAuthAttemptsTable>,
    expectedStatuses: readonly ProviderAuthAttemptRecord["status"][] = activeStatuses
  ) {
    const row = await this.database
      .updateTable("provider_auth_attempts")
      .set(values)
      .where("id", "=", attemptId)
      .where("status", "in", expectedStatuses)
      .returningAll()
      .executeTakeFirst();
    return row ? mapAttempt(row) : this.requireAttempt(attemptId);
  }

  private async requireAttempt(attemptId: string) {
    const attempt = await this.get(attemptId);
    if (!attempt) throw new Error("Provider AuthAttempt disappeared during transition.");
    return attempt;
  }
}

function mapAttempt(row: Selectable<ProviderAuthAttemptsTable>): ProviderAuthAttemptRecord {
  return {
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    failureCount: row.failure_count,
    finishedAt: row.finished_at,
    id: row.id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    leaseExpiresAt: row.lease_expires_at,
    maskedPhone: row.masked_phone,
    method: row.method,
    operation: row.operation,
    ownerId: row.owner_id,
    protectedState: deserializeProtectedState(row),
    provider: row.provider,
    qrUrl: null,
    resendAfter: row.resend_after,
    status: row.status,
    updatedAt: row.updated_at
  };
}

function deserializeProtectedState(row: Selectable<ProviderAuthAttemptsTable>) {
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
    authTag: row.secret_auth_tag,
    ciphertext: row.secret_ciphertext,
    encryptionVersion: row.encryption_version,
    keyId: row.key_id,
    nonce: row.secret_nonce
  };
}

function serializeProtectedState(state: ProtectedSecret | null) {
  return state
    ? {
        encryption_version: state.encryptionVersion,
        key_id: state.keyId,
        secret_auth_tag: state.authTag,
        secret_ciphertext: state.ciphertext,
        secret_nonce: state.nonce
      }
    : {
        encryption_version: null,
        key_id: null,
        secret_auth_tag: null,
        secret_ciphertext: null,
        secret_nonce: null
      };
}

function safeMessage(message: string) {
  return message.slice(0, 500);
}
