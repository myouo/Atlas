PRAGMA foreign_keys = ON;

-- Owner-only, sanitized, rebuildable Provider read model. Raw Provider payloads remain
-- immutable evidence in provider_raw_snapshots; this table is the bounded data catalog
-- consumed by authenticated configuration tools.
CREATE TABLE provider_data_catalogs (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'netease'),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  data_version_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  generated_at TEXT NOT NULL
);

CREATE INDEX provider_data_catalog_provider_generated_idx
  ON provider_data_catalogs(provider, generated_at DESC);
