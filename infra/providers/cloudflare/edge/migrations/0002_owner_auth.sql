PRAGMA foreign_keys = ON;

CREATE TABLE actors (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'viewer')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'github'),
  provider_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE auth_oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier_ciphertext BLOB NOT NULL,
  code_verifier_nonce BLOB NOT NULL,
  code_verifier_auth_tag BLOB NOT NULL,
  encryption_version INTEGER NOT NULL,
  key_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX auth_identity_actor_idx ON auth_identities(actor_id);
CREATE INDEX auth_state_expiry_idx ON auth_oauth_states(expires_at);
CREATE INDEX auth_session_actor_expiry_idx ON auth_sessions(actor_id, expires_at);
