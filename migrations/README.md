# Database migrations

Migrations are explicit Kysely modules and are never run from API startup.

- `001_current_dashboard_state.mjs` creates the minimum Phase 2 profile, Dashboard, current-state, and Widget persistence model.
- `002_immutable_dashboard_revisions.mjs` backfills immutable Layout/Widget snapshots and Draft/Published pointers, validates preservation, then retires the mutable Phase 2 tables.
- `003_projection_sync_runtime.mjs` extracts Phase 3 runtime payloads into keyed projections, backfills without data loss, removes Projection/stale timestamps from immutable Revision Widgets, and creates Provider connection/SyncRun/SyncState/Raw Snapshot tables.
- `004_owner_auth_netease_provider.mjs` adds actors, GitHub identities, hashed opaque sessions, encrypted Provider credentials, Raw `source_kind`, `dataConfig`/`presentationConfig`, NetEase native tables, and immutable current-Widget v2 successors while preserving all v1 history.
- `005_netease_interactive_auth_attempts.mjs` adds expiring QR/SMS AuthAttempt state with AEAD envelope constraints, active-attempt deduplication, leases, and safe public metadata.
- `006_netease_data_catalog.mjs` adds the Owner-only normalized Provider catalog and extends native metric constraints for Provider-reported total duration in seconds.
- `007_netease_showcase_and_ranking_v2.mjs` clones current Revisions containing legacy ranking/showcase Widgets, upgrades the rank payload to weekly plus all-time, and replaces implicit single-track cards with an explicit six-item gallery while preserving v1 history.
- Run from the repository root with `pnpm db:migrate`, inspect with `pnpm db:migrate:status`, and roll back one migration with `pnpm db:rollback`.
- Rolling back migration `002` reconstructs only the then-current Phase 2 Draft/Published state and is a schema-development operation. User-visible Revision Restore instead clones history into a new immutable Draft and never runs a database down migration.
- Rolling back migration `003` reconstructs Phase 3 runtime Widget columns from matching Last Known Good projections before removing the Phase 4 runtime tables.
- Rolling back migration `004` removes Auth/credential/native structures and restores Phase 4 configuration/projection keys. It fails closed if Dashboard writes occurred after the generated `schema_upgrade` revisions, preventing an unsafe destructive downgrade.
- Rolling back migration `005` removes only ephemeral Provider AuthAttempts and leaves acquired encrypted credentials untouched.
- Rolling back migration `006` removes only rebuildable catalog/total-duration derived data before restoring the earlier metric constraints.
- Rolling back migration `007` restores the pre-upgrade pointers only when no later Dashboard write descends from the generated semantic-upgrade Revision.
