# ADR 0006: Store Dashboard changes as immutable full-snapshot revisions

- Status: Accepted
- Date: 2026-08-23

## Context

Phase 2 stores one mutable Draft row and one mutable Published row. That model proves persistence but cannot retain history, safely restore deleted Widgets, or identify the exact representation on which a client based an edit. Phase 3 must preserve existing Phase 2 data while making every historical Dashboard representation immutable.

The Dashboard snapshot is currently small, and reads must remain direct rather than replaying events.

## Decision

Use a full-snapshot revision model:

- `dashboards` owns `current_draft_revision_id`, `current_published_revision_id`, and a transactionally allocated `next_revision_number`.
- `dashboard_revisions` stores UUID identity, per-Dashboard revision number, parent, optional restore provenance, responsive layout JSONB, operation metadata, nullable future actor identity, and creation time.
- `widgets` stores stable logical Widget identity and Dashboard ownership.
- `dashboard_revision_widgets` stores the complete Widget state for one revision: semantic type, schema version, title, enabled/stale state, config, projection data, projection timestamp, and sort order.
- Revision and Widget-snapshot rows are insert-only in application code. PostgreSQL update-prevention triggers enforce immutability after insertion.
- Every Draft content mutation creates a new full revision and then moves the Draft pointer. Publish only moves the Published pointer to the already immutable current Draft revision.
- Restore clones a historical snapshot into a new Draft revision. Its parent is the previously current Draft; `restored_from_revision_id` records the selected historical source. Restore never changes the source revision and never publishes automatically.

Revision operations are metadata only: `initial_migration`, `seed`, `save`, `widget_add`, `widget_update`, `widget_delete`, and `restore`. They are not an event stream and are never replayed to render a Dashboard.

## Phase 2 migration

The migration creates revision tables before retiring mutable state. For every existing Dashboard it:

1. validates that Draft and Published Phase 2 states exist;
2. creates stable Widget identities from existing Widget IDs;
3. backfills a Published revision followed by a Draft revision, preserving both layouts and all Widget snapshot fields;
4. points `current_published_revision_id` and `current_draft_revision_id` at those revisions;
5. validates row counts and non-null pointers;
6. drops `widget_instances` and `dashboard_states` so there is no permanent dual write.

The down migration reconstructs only the then-current Draft and Published mutable states. Database migration rollback is therefore a development/schema operation and is distinct from user-visible Revision Restore.

The Phase 3 development Seed intentionally resets the Fixture Dashboard to one stable initial revision referenced by both pointers. Repeated Seed runs do not append history.

## Alternatives

- Keep mutable current tables and append audit rows: rejected because dual-write drift would leave two sources of truth.
- Store one JSONB Dashboard blob per revision: rejected because Widget identity and snapshot ownership would lose relational constraints.
- Store deltas or replay Widget operations: rejected because this would introduce event-sourcing complexity and slower reads without a demonstrated size problem.
- Mutate a historical revision when restoring: rejected because it destroys auditability and makes strong validators unreliable.

## Consequences

- Historical layout, config, projection, and deleted Widget state remain recoverable.
- Current Dashboard reads remain one pointer lookup plus one ordered snapshot query.
- Snapshot storage grows linearly; Phase 3 deliberately has no pruning or compression policy.
- Phase 2 API bodies can remain substantially stable while revision UUID and metadata become explicit.
