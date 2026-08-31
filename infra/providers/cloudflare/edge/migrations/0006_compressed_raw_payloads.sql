ALTER TABLE provider_raw_snapshots
  ADD COLUMN payload_encoding TEXT NOT NULL DEFAULT 'json'
  CHECK (payload_encoding IN ('json', 'gzip'));

ALTER TABLE provider_raw_snapshots
  ADD COLUMN payload_blob BLOB;
