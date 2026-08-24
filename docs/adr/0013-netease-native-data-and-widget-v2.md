# ADR 0013: Add Netease native observations and an honest Widget v2

- Status: Accepted
- Date: 2026-08-24

## Context

The Phase 1 Fixture shape for `music.netease.overview@1` requires minutes, percentage change, genre shares, and a seven-day trend. The selected real endpoints do not guarantee all of those semantics. Filling absent values would violate Provider schema-drift and no-fake-data invariants. Phase 4 also hashes the complete Widget config, so presentation-only changes create unnecessary Projection partitions.

## Decision

Introduce `music.netease.overview@2` with explicit availability, provenance, and coverage. It can represent complete, partial, empty, stale, and unavailable Provider data without manufacturing values.

Widget configuration is split generically:

```text
Widget Configuration
├── dataConfig          affects projection identity
└── presentationConfig  affects rendering only
```

Projection identity becomes SHA-256 over canonical `{type, schemaVersion, dataConfig}`. Migration 004 backfills the split for every historical Widget and rekeys projections. Presentation changes no longer partition derived data.

Because `type + schemaVersion` is the renderer contract, v1 is not silently reinterpreted. Migration 004 preserves every historical v1 revision and creates explicit `schema_upgrade` successor snapshots for current Draft/Published pointers when needed. This one-time schema migration is not Provider Sync; later sync remains revision-isolated. Missing v2 Projection renders an honest unavailable state until sync succeeds.

## Native model

Provider-specific tables store only observed semantics:

- `netease_accounts`: stable connection-scoped Provider user identity;
- `netease_tracks`, `netease_artists`, `netease_track_artists`: connection-scoped metadata;
- `netease_recent_listens`: only records with Provider-supplied `played_at`;
- `netease_track_play_snapshots`: ranked period observations with Provider play count/score;
- `netease_metric_snapshots`: provider-reported total/duration observations.

Internal UUIDs are primary keys. Provider IDs are strings with connection-scoped unique constraints. Replaying or redelivering one Raw Snapshot upserts tracks and de-duplicates observations/events through source/identity constraints.

## Atomicity

`SyncUnitOfWork` supplies a provider-neutral Native Store registry backed by the same PostgreSQL transaction as Projection and SyncRun completion:

```text
validated normalized batch
        ↓
native upsert + projection upsert + credential/sync state + run completion
        ↓ one commit
```

Raw Snapshots remain a preceding immutable evidence commit. If native/projector work fails, the completion transaction rolls back and Last Known Good data remains.

## Replay

Replay loads the complete Raw Snapshot batch for the selected snapshot's SyncRun. Dry-run validates, normalizes, projects, and reports a redacted diff without writes. `--commit` atomically writes native/projection derived state only; it never creates a Dashboard Revision, changes pointers, or alters `rev:` ETags.

## Alternatives

- Keep Widget v1 and fill absent values: rejected as false data.
- Make all v1 fields optional without a version change: rejected because it breaks the established renderer contract.
- Store all native data in one Provider JSONB table: rejected because track identity, artists, observations, timestamps, and idempotency need relational constraints.
- Hash presentation config: rejected because it does not affect fetched/derived results.
- Mutate historical v1 snapshots into v2: rejected because it destroys immutable history.

## Consequences

- The Web registers both v1 (historical Fixture rendering) and v2 (real semantic rendering).
- Migration can add a small number of explicit schema-upgrade Revisions once; Provider Sync itself still creates none.
- Full native and Raw Snapshot retention remains unbounded until a measured retention policy is designed.
