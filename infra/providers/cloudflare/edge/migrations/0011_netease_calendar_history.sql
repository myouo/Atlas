PRAGMA foreign_keys = ON;

CREATE TABLE netease_calendar_history (
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('week', 'month')),
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  range_json TEXT NOT NULL CHECK (json_valid(range_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider_connection_id, period, start_time)
);

CREATE INDEX netease_calendar_history_period_idx
  ON netease_calendar_history(provider_connection_id, period, start_time DESC);

CREATE TABLE netease_calendar_backfill (
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('week', 'month')),
  next_end_time INTEGER,
  account_created_at INTEGER,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
  lease_token TEXT,
  lease_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider_connection_id, period)
);
