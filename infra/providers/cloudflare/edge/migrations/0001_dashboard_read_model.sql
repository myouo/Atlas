PRAGMA foreign_keys = ON;

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  headline TEXT NOT NULL,
  bio TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  tags_json TEXT NOT NULL CHECK (json_valid(tags_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  current_draft_revision_id TEXT,
  current_published_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE dashboard_revisions (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  parent_revision_id TEXT REFERENCES dashboard_revisions(id) ON DELETE RESTRICT,
  restored_from_revision_id TEXT REFERENCES dashboard_revisions(id) ON DELETE RESTRICT,
  layout_json TEXT NOT NULL CHECK (json_valid(layout_json)),
  operation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE (dashboard_id, revision_number)
);

CREATE TABLE widgets (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE dashboard_revision_widgets (
  revision_id TEXT NOT NULL REFERENCES dashboard_revisions(id) ON DELETE CASCADE,
  widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE RESTRICT,
  widget_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  title TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  data_config_json TEXT NOT NULL CHECK (json_valid(data_config_json)),
  presentation_config_json TEXT NOT NULL CHECK (json_valid(presentation_config_json)),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (revision_id, widget_id)
);

CREATE TABLE widget_projections (
  widget_id TEXT NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  projection_key TEXT NOT NULL,
  projection_version_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  projection_schema_version INTEGER NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
  generated_at TEXT NOT NULL,
  last_success_at TEXT NOT NULL,
  PRIMARY KEY (widget_id, projection_key)
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
  queue_job_id TEXT
);

CREATE TABLE queue_deliveries (
  message_id TEXT PRIMARY KEY,
  queue_job_id TEXT NOT NULL,
  sync_run_id TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX dashboard_owner_slug_idx ON dashboards(owner_id, slug);
CREATE INDEX revision_dashboard_number_idx ON dashboard_revisions(dashboard_id, revision_number DESC);
CREATE INDEX revision_widget_widget_idx ON dashboard_revision_widgets(widget_id);
CREATE INDEX sync_run_owner_requested_idx ON provider_sync_runs(owner_id, requested_at DESC);
