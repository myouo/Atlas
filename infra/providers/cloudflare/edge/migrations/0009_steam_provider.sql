-- Widen Provider constraints without dropping data through cascading foreign keys.
-- Snapshot the complete FK subgraph, rebuild children before parents, then restore

-- parents before children. Run atomically through the D1 migration runner.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE _steam_backup_provider_connections AS SELECT * FROM provider_connections;

CREATE TABLE _steam_backup_provider_sync_runs AS SELECT * FROM provider_sync_runs;

CREATE TABLE _steam_backup_provider_credentials AS SELECT * FROM provider_credentials;

CREATE TABLE _steam_backup_provider_sync_states AS SELECT * FROM provider_sync_states;

CREATE TABLE _steam_backup_provider_raw_snapshots AS SELECT * FROM provider_raw_snapshots;

CREATE TABLE _steam_backup_netease_accounts AS SELECT * FROM netease_accounts;

CREATE TABLE _steam_backup_provider_data_catalogs AS SELECT * FROM provider_data_catalogs;

CREATE TABLE _steam_backup_provider_normalized_snapshots AS SELECT * FROM provider_normalized_snapshots;

DROP TABLE provider_normalized_snapshots;

DROP TABLE provider_raw_snapshots;

DROP TABLE provider_credentials;

DROP TABLE provider_sync_states;

DROP TABLE netease_accounts;

DROP TABLE provider_data_catalogs;

DROP TABLE provider_sync_runs;

DROP TABLE provider_connections;

CREATE TABLE provider_connections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('netease', 'steam')),
  account_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, provider)
);

CREATE TABLE provider_sync_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  queue_job_id TEXT,
  provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE CASCADE
);

CREATE TABLE provider_credentials (
  id TEXT PRIMARY KEY,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('music_u', 'steam_web_api')),
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

CREATE TABLE provider_sync_states (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('netease', 'steam')),
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

CREATE TABLE provider_raw_snapshots (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES provider_sync_runs(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('netease', 'steam')),
  source_kind TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  source_cursor TEXT,
  source_timestamp TEXT,
  created_at TEXT NOT NULL,
  payload_encoding TEXT NOT NULL DEFAULT 'json' CHECK (payload_encoding IN ('json', 'gzip')),
  payload_blob BLOB
);

CREATE TABLE netease_accounts (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE provider_data_catalogs (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('netease', 'steam')),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  data_version_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  generated_at TEXT NOT NULL
);

CREATE TABLE provider_normalized_snapshots (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL UNIQUE REFERENCES provider_sync_runs(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('fixture', 'netease', 'github', 'bangumi', 'steam', 'bilibili')),
  protocol_version TEXT NOT NULL CHECK (protocol_version = '2.0'),
  schema_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  message_json TEXT NOT NULL CHECK (COALESCE(
    json_valid(message_json)
    AND json_type(message_json) = 'object'
    AND json_extract(message_json, '$.meta.kind') = 'normalization.result'
    AND json_extract(message_json, '$.meta.protocol') = 'nivalis.provider-data'
    AND json_extract(message_json, '$.meta.protocolVersion') = protocol_version
    AND json_extract(message_json, '$.meta.provider') = provider
    AND json_extract(message_json, '$.meta.schemaId') = schema_id
    AND json_extract(message_json, '$.meta.schemaVersion') = schema_version,
    0
  )),
  created_at TEXT NOT NULL
);

INSERT INTO provider_connections SELECT * FROM _steam_backup_provider_connections;

INSERT INTO provider_sync_runs SELECT * FROM _steam_backup_provider_sync_runs;

INSERT INTO provider_credentials SELECT * FROM _steam_backup_provider_credentials;

INSERT INTO provider_sync_states SELECT * FROM _steam_backup_provider_sync_states;

INSERT INTO provider_raw_snapshots SELECT * FROM _steam_backup_provider_raw_snapshots;

INSERT INTO netease_accounts SELECT * FROM _steam_backup_netease_accounts;

INSERT INTO provider_data_catalogs SELECT * FROM _steam_backup_provider_data_catalogs;

INSERT INTO provider_normalized_snapshots SELECT * FROM _steam_backup_provider_normalized_snapshots;

CREATE INDEX sync_run_owner_requested_idx ON provider_sync_runs(owner_id, requested_at DESC);

CREATE INDEX provider_raw_run_kind_idx
  ON provider_raw_snapshots(sync_run_id, source_kind);

CREATE INDEX provider_data_catalog_provider_generated_idx
  ON provider_data_catalogs(provider, generated_at DESC);

CREATE UNIQUE INDEX provider_sync_runs_active_connection_uq
  ON provider_sync_runs(provider_connection_id)
  WHERE status IN ('queued', 'running', 'retry_wait');

CREATE INDEX provider_normalized_snapshots_connection_created_idx
  ON provider_normalized_snapshots(provider_connection_id, created_at);

CREATE TRIGGER provider_normalized_snapshots_immutable_update
BEFORE UPDATE ON provider_normalized_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Provider Normalized Snapshots are immutable');
END;

DROP TABLE _steam_backup_provider_normalized_snapshots;

DROP TABLE _steam_backup_provider_raw_snapshots;

DROP TABLE _steam_backup_provider_credentials;

DROP TABLE _steam_backup_provider_sync_states;

DROP TABLE _steam_backup_netease_accounts;

DROP TABLE _steam_backup_provider_data_catalogs;

DROP TABLE _steam_backup_provider_sync_runs;

DROP TABLE _steam_backup_provider_connections;

PRAGMA defer_foreign_keys = OFF;
