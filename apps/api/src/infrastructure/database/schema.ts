import type {
  DashboardRevisionOperation,
  CredentialStatus,
  JsonObject,
  JsonValue,
  ProviderType,
  ProviderAuthAttemptOperation,
  ProviderAuthAttemptStatus,
  ProviderAuthMethod,
  ResponsiveLayout,
  SyncRunStatus,
  WidgetType
} from "@nivalis/domain";
import type { ColumnType, JSONColumnType } from "kysely";

type Timestamp = ColumnType<Date, Date, Date>;

export interface ProfilesTable {
  avatar_url: string;
  bio: string;
  created_at: Timestamp;
  display_name: string;
  handle: string;
  headline: string;
  id: string;
  owner_id: string;
  tags: JSONColumnType<readonly string[]>;
  updated_at: Timestamp;
}

export interface DashboardsTable {
  created_at: Timestamp;
  current_draft_revision_id: string;
  current_published_revision_id: string;
  id: string;
  next_revision_number: number;
  owner_id: string;
  profile_id: string;
  slug: string;
  updated_at: Timestamp;
}

export interface DashboardRevisionsTable {
  created_at: Timestamp;
  created_by: string | null;
  dashboard_id: string;
  id: string;
  layout: JSONColumnType<ResponsiveLayout>;
  operation: DashboardRevisionOperation;
  parent_revision_id: string | null;
  restored_from_revision_id: string | null;
  revision_number: number;
}

export interface WidgetsTable {
  created_at: Timestamp;
  dashboard_id: string;
  id: string;
}

export interface DashboardRevisionWidgetsTable {
  data_config: JSONColumnType<JsonObject>;
  dashboard_id: string;
  enabled: boolean;
  presentation_config: JSONColumnType<JsonObject>;
  provider: ProviderType;
  revision_id: string;
  schema_version: number;
  sort_order: number;
  title: string;
  widget_id: string;
  widget_type: WidgetType;
}

export interface ProviderConnectionsTable {
  account_key: string;
  created_at: Timestamp;
  enabled: boolean;
  id: string;
  owner_id: string;
  provider: ProviderType;
  updated_at: Timestamp;
}

export interface ProviderSyncRunsTable {
  attempt_count: number;
  created_at: Timestamp;
  finished_at: Timestamp | null;
  id: string;
  last_error_code: string | null;
  last_error_message: string | null;
  provider: ProviderType;
  provider_connection_id: string;
  queue_job_id: string | null;
  requested_at: Timestamp;
  started_at: Timestamp | null;
  status: SyncRunStatus;
  updated_at: Timestamp;
}

export interface ProviderSyncStatesTable {
  attempt_count: number;
  last_attempt_at: Timestamp | null;
  last_error_at: Timestamp | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_success_at: Timestamp | null;
  last_successful_run_id: string | null;
  provider: ProviderType;
  provider_connection_id: string;
  status: "idle" | "credential_invalid" | SyncRunStatus;
  updated_at: Timestamp;
}

export interface ProviderRawSnapshotsTable {
  created_at: Timestamp;
  fetched_at: Timestamp;
  id: string;
  payload: ColumnType<JsonValue, string, never>;
  payload_hash: string;
  provider: ProviderType;
  provider_connection_id: string;
  schema_version: number;
  source_cursor: string | null;
  source_kind: string;
  source_timestamp: Timestamp | null;
  sync_run_id: string;
}

type Binary = ColumnType<Uint8Array, Uint8Array, Uint8Array>;
type Numeric = ColumnType<string, number | string, number | string>;

export interface ActorsTable {
  created_at: Timestamp;
  id: string;
  role: "owner" | "viewer";
  updated_at: Timestamp;
}

export interface AuthIdentitiesTable {
  actor_id: string;
  created_at: Timestamp;
  id: string;
  provider: "github";
  provider_subject: string;
  updated_at: Timestamp;
}

export interface AuthSessionsTable {
  actor_id: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  id: string;
  revoked_at: Timestamp | null;
  token_hash: string;
}

export interface AuthOauthStatesTable {
  code_verifier_auth_tag: Binary;
  code_verifier_ciphertext: Binary;
  code_verifier_nonce: Binary;
  consumed_at: Timestamp | null;
  created_at: Timestamp;
  encryption_version: number;
  expires_at: Timestamp;
  key_id: string;
  state_hash: string;
}

export interface ProviderCredentialsTable {
  auth_tag: Binary;
  ciphertext: Binary;
  created_at: Timestamp;
  credential_type: "music_u";
  encryption_version: number;
  id: string;
  key_id: string;
  nonce: Binary;
  provider_connection_id: string;
  status: Exclude<CredentialStatus, "not_configured">;
  updated_at: Timestamp;
  validated_at: Timestamp | null;
}

export interface ProviderAuthAttemptsTable {
  created_at: Timestamp;
  encryption_version: number | null;
  expires_at: Timestamp;
  failure_count: number;
  finished_at: Timestamp | null;
  id: string;
  key_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  lease_expires_at: Timestamp | null;
  masked_phone: string | null;
  method: ProviderAuthMethod;
  operation: ProviderAuthAttemptOperation;
  owner_id: string;
  provider: "netease";
  resend_after: Timestamp | null;
  secret_auth_tag: Binary | null;
  secret_ciphertext: Binary | null;
  secret_nonce: Binary | null;
  status: ProviderAuthAttemptStatus;
  updated_at: Timestamp;
}

export interface NeteaseAccountsTable {
  created_at: Timestamp;
  display_name: string | null;
  last_validated_at: Timestamp;
  provider_connection_id: string;
  provider_user_id: string;
  updated_at: Timestamp;
}

export interface NeteaseTracksTable {
  album_name: string | null;
  album_provider_id: string | null;
  cover_url: string | null;
  created_at: Timestamp;
  duration_ms: number | null;
  id: string;
  name: string;
  provider_connection_id: string;
  provider_track_id: string;
  updated_at: Timestamp;
}

export interface NeteaseArtistsTable {
  created_at: Timestamp;
  id: string;
  name: string;
  provider_artist_id: string;
  provider_connection_id: string;
  updated_at: Timestamp;
}

export interface NeteaseTrackArtistsTable {
  artist_id: string;
  position: number;
  track_id: string;
}

export interface NeteaseRecentListensTable {
  created_at: Timestamp;
  id: string;
  provider_connection_id: string;
  provider_played_at: Timestamp;
  source_snapshot_id: string;
  track_id: string;
}

export interface NeteaseTrackPlaySnapshotsTable {
  id: string;
  observed_at: Timestamp;
  period: "week" | "all_time";
  play_count: number;
  provider_connection_id: string;
  score: Numeric | null;
  source_snapshot_id: string;
  track_id: string;
}

export interface NeteaseMetricSnapshotsTable {
  id: string;
  metric: "total_listen_count" | "listening_duration" | "listening_duration_total";
  observed_at: Timestamp;
  period: string;
  provenance: "provider_reported" | "nivalis_derived";
  provider_connection_id: string;
  source_snapshot_id: string;
  unit: "plays" | "minutes" | "seconds";
  value: Numeric;
}

export interface WidgetProjectionsTable {
  data: ColumnType<JsonValue, string, string>;
  generated_at: Timestamp;
  last_success_at: Timestamp;
  projection_key: string;
  projection_schema_version: number;
  projection_version_id: string;
  provider: ProviderType;
  provider_connection_id: string | null;
  source_snapshot_id: string | null;
  stale: boolean;
  widget_id: string;
}

export interface ProviderDataCatalogsTable {
  data: JSONColumnType<JsonObject>;
  data_version_id: string;
  generated_at: Timestamp;
  provider: "netease";
  provider_connection_id: string;
  schema_version: number;
}

export interface Database {
  actors: ActorsTable;
  auth_identities: AuthIdentitiesTable;
  auth_oauth_states: AuthOauthStatesTable;
  auth_sessions: AuthSessionsTable;
  dashboard_revision_widgets: DashboardRevisionWidgetsTable;
  dashboard_revisions: DashboardRevisionsTable;
  dashboards: DashboardsTable;
  netease_accounts: NeteaseAccountsTable;
  netease_artists: NeteaseArtistsTable;
  netease_metric_snapshots: NeteaseMetricSnapshotsTable;
  netease_recent_listens: NeteaseRecentListensTable;
  netease_track_artists: NeteaseTrackArtistsTable;
  netease_track_play_snapshots: NeteaseTrackPlaySnapshotsTable;
  netease_tracks: NeteaseTracksTable;
  provider_connections: ProviderConnectionsTable;
  provider_auth_attempts: ProviderAuthAttemptsTable;
  provider_credentials: ProviderCredentialsTable;
  provider_data_catalogs: ProviderDataCatalogsTable;
  provider_raw_snapshots: ProviderRawSnapshotsTable;
  provider_sync_runs: ProviderSyncRunsTable;
  provider_sync_states: ProviderSyncStatesTable;
  profiles: ProfilesTable;
  widget_projections: WidgetProjectionsTable;
  widgets: WidgetsTable;
}
