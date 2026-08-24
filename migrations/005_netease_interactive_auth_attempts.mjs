import { sql } from "kysely";

/** @param {import("kysely").Kysely<any>} db */
export async function up(db) {
  await db.schema
    .createTable("provider_auth_attempts")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("owner_id", "uuid", (column) =>
      column.notNull().references("actors.id").onDelete("cascade")
    )
    .addColumn("provider", "varchar(32)", (column) => column.notNull())
    .addColumn("method", "varchar(24)", (column) => column.notNull())
    .addColumn("operation", "varchar(24)", (column) => column.notNull())
    .addColumn("status", "varchar(40)", (column) => column.notNull())
    .addColumn("masked_phone", "varchar(40)")
    .addColumn("secret_ciphertext", "bytea")
    .addColumn("secret_nonce", "bytea")
    .addColumn("secret_auth_tag", "bytea")
    .addColumn("encryption_version", "integer")
    .addColumn("key_id", "varchar(120)")
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("resend_after", "timestamptz")
    .addColumn("lease_expires_at", "timestamptz")
    .addColumn("failure_count", "integer", (column) => column.notNull())
    .addColumn("last_error_code", "varchar(120)")
    .addColumn("last_error_message", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addColumn("finished_at", "timestamptz")
    .addCheckConstraint("provider_auth_attempts_provider_ck", sql`provider = 'netease'`)
    .addCheckConstraint("provider_auth_attempts_method_ck", sql`method in ('qr', 'sms_otp')`)
    .addCheckConstraint(
      "provider_auth_attempts_operation_ck",
      sql`operation in ('qr_prepare', 'qr_poll', 'sms_send', 'sms_verify')`
    )
    .addCheckConstraint(
      "provider_auth_attempts_status_ck",
      sql`status in (
        'queued', 'preparing', 'waiting_for_scan', 'waiting_for_confirmation',
        'waiting_for_code', 'verifying', 'connected', 'expired', 'failed'
      )`
    )
    .addCheckConstraint("provider_auth_attempts_failure_count_ck", sql`failure_count >= 0`)
    .addCheckConstraint(
      "provider_auth_attempts_secret_envelope_ck",
      sql`(
        secret_ciphertext is null and secret_nonce is null and secret_auth_tag is null
        and encryption_version is null and key_id is null
      ) or (
        secret_ciphertext is not null and secret_nonce is not null and secret_auth_tag is not null
        and encryption_version is not null and key_id is not null
        and octet_length(secret_nonce) = 12 and octet_length(secret_auth_tag) = 16
        and encryption_version >= 1
      )`
    )
    .execute();

  await sql`
    create unique index provider_auth_attempts_owner_active_uq
    on provider_auth_attempts (owner_id, provider)
    where status in (
      'queued', 'preparing', 'waiting_for_scan', 'waiting_for_confirmation',
      'waiting_for_code', 'verifying'
    )
  `.execute(db);
  await db.schema
    .createIndex("provider_auth_attempts_owner_updated_idx")
    .on("provider_auth_attempts")
    .columns(["owner_id", "updated_at"])
    .execute();
  await db.schema
    .createIndex("provider_auth_attempts_expiry_idx")
    .on("provider_auth_attempts")
    .column("expires_at")
    .execute();
}

/** @param {import("kysely").Kysely<any>} db */
export async function down(db) {
  await db.schema.dropTable("provider_auth_attempts").execute();
}
