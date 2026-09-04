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

CREATE INDEX provider_normalized_snapshots_connection_created_idx
  ON provider_normalized_snapshots(provider_connection_id, created_at);

CREATE TRIGGER provider_normalized_snapshots_immutable_update
BEFORE UPDATE ON provider_normalized_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Provider Normalized Snapshots are immutable');
END;
