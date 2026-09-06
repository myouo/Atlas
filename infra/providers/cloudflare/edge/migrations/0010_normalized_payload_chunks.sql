-- Large normalized documents are stored losslessly as bounded immutable chunks.
-- The parent row retains its protocol metadata and an internal storage reference.
CREATE TABLE provider_normalized_payload_chunks (
  snapshot_id TEXT NOT NULL REFERENCES provider_normalized_snapshots(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0 AND chunk_index < 64),
  payload BLOB NOT NULL CHECK (length(payload) <= 512000),
  PRIMARY KEY (snapshot_id, chunk_index)
);

CREATE TRIGGER provider_normalized_payload_chunks_immutable_update
BEFORE UPDATE ON provider_normalized_payload_chunks
BEGIN
  SELECT RAISE(ABORT, 'Provider Normalized payload chunks are immutable');
END;
