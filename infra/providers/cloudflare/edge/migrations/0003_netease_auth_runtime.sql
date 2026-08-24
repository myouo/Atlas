PRAGMA foreign_keys = ON;

CREATE TABLE provider_connections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'netease'),
  account_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, provider)
);

CREATE TABLE provider_credentials (
  id TEXT PRIMARY KEY,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type = 'music_u'),
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  encryption_version INTEGER NOT NULL,
  key_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_validation', 'valid', 'expired', 'invalid', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  validated_at TEXT,
  UNIQUE (provider_connection_id, credential_type)
);

CREATE TABLE provider_auth_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'netease'),
  method TEXT NOT NULL CHECK (method IN ('qr', 'sms_otp')),
  operation TEXT NOT NULL CHECK (operation IN ('qr_prepare', 'qr_poll', 'sms_send', 'sms_verify')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'waiting_for_scan', 'waiting_for_confirmation', 'waiting_for_code', 'verifying', 'connected', 'expired', 'failed')),
  masked_phone TEXT,
  secret_ciphertext BLOB,
  secret_nonce BLOB,
  secret_auth_tag BLOB,
  encryption_version INTEGER,
  key_id TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  lease_expires_at TEXT,
  resend_after TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE UNIQUE INDEX provider_auth_one_active_owner_idx
  ON provider_auth_attempts(owner_id, provider)
  WHERE status IN ('queued', 'preparing', 'waiting_for_scan', 'waiting_for_confirmation', 'waiting_for_code', 'verifying');

CREATE INDEX provider_auth_owner_created_idx
  ON provider_auth_attempts(owner_id, created_at DESC);

CREATE TABLE provider_sync_states (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'netease'),
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  last_successful_run_id TEXT,
  updated_at TEXT NOT NULL
);

ALTER TABLE provider_sync_runs ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE CASCADE;

CREATE TABLE provider_raw_snapshots (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES provider_sync_runs(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'netease'),
  source_kind TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_cursor TEXT,
  source_timestamp TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX provider_raw_run_kind_idx
  ON provider_raw_snapshots(sync_run_id, source_kind);

CREATE TABLE netease_accounts (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  updated_at TEXT NOT NULL
);
