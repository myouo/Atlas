# ADR 0008: Separate immutable Dashboard configuration from live Provider projections

- Status: Accepted
- Date: 2026-08-24

## Context

Phase 3 correctly makes Dashboard revisions immutable, but each revision Widget snapshot still contains Provider-derived `projection_data`, `stale`, and `widget_updated_at`. A Provider refresh would therefore either mutate immutable history or create a new user Revision. It also invalidates the Phase 3 assumption that a Draft response body is fully represented by `ETag: "rev:<revision-id>"`.

Provider data is rebuildable derived state. Layout, Widget identity/type/schema version/config/enabled state, and title are owner-controlled configuration.

## Decision

Split the two lifecycles:

```text
Dashboard Revision (source of truth, immutable)
├── layout
└── Widget configuration snapshots
    ├── widget identity
    ├── type + schemaVersion
    ├── title
    ├── config
    └── enabled

Widget Projection Store (derived, replaceable)
├── widget identity
├── projection key
├── projection version
├── provider / connection
├── data
├── source Raw Snapshot
├── stale state
└── generated / last-success timestamps
```

`dashboard_revision_widgets` drops Provider data and runtime freshness columns after Migration 003 backfills `widget_projections`. There is no permanent dual write. Historical Revisions remain immutable configuration snapshots; deleted Widgets remain addressable through stable `widgets` identity and historical configuration rows.

Projection identity is:

```text
widget_id + SHA-256(canonical JSON({ type, schemaVersion, config }))
```

Phase 4 hashes the complete config because no Widget-definition metadata yet distinguishes display-only from data-relevant keys. This can over-partition safely, but it cannot cross-contaminate different configurations.

Projection rows are Last Known Good values. A failed fetch/normalization/projection run updates Sync state but never deletes or replaces the previous successful projection. A successful run builds all outputs in memory, then commits projection rows, Provider state, and SyncRun completion in one transaction.

## HTTP representation boundaries

- `GET /v1/me/dashboards/about/draft` becomes configuration-only. Its body is immutable for one Revision, so strong `ETag: "rev:<uuid>"` remains the edit precondition.
- `GET /v1/me/dashboards/about/data` is the live, hydrated current-Draft data resource. It has an independent strong data/view ETag.
- `GET /v1/public/dashboards/about` remains one aggregated read model, but its strong ETag is derived from the Published Revision UUID plus ordered projection-version and effective-freshness identities: `"view:<sha256>"`.
- `NivalisApiDashboardSource` joins configuration and live data for Web consumers. `DashboardCanvas` and renderers keep receiving hydrated Widgets and do not learn the storage split.

Missing projections produce explicit stale schema-valid fallback data for rendering; an existing Last Known Good projection for a matching key is always preferred. A projection for a different config key is never substituted.

## Migration

Migration 003:

1. creates Provider connection/state/run, immutable Raw Snapshot, and projection tables;
2. computes a projection key for every distinct historical Widget configuration;
3. backfills the newest Phase 3 Provider payload for every `(widget_id, projection_key)` pair;
4. validates the distinct projection backfill count and exercises Draft/Published hydration in the migration test;
5. drops `projection_data`, `stale`, and `widget_updated_at` from Revision Widget snapshots.

The migration-created Fixture connection is disabled because migrations run in every environment. The explicit development Seed replaces it with an enabled Fixture connection; production never enables Fixture through schema migration.

The down migration reconstructs those Phase 3 runtime columns from matching projections. It is a schema-development rollback, not a user data Restore.

## Alternatives

- Create a Dashboard Revision on sync: rejected because external data is not an owner layout/config decision.
- Mutate historical Revision Widget data: rejected because it breaks immutability, ETag correctness, and auditability.
- Key projections by Widget ID only: rejected because Draft and Published can share identity while using different config.
- Replay Provider events on every read: rejected because full current projections provide simpler and faster read models.

## Consequences

- Provider sync cannot change Draft/Published pointers, Revision history count, or Revision ETags.
- Public view ETags change whenever configuration, a selected projection version, or an effective stale state changes.
- Projections can be deleted and rebuilt from sanitized Raw Snapshots.
- Full Projection payloads remain small in Phase 4; no compression or Provider-native tables are introduced.
