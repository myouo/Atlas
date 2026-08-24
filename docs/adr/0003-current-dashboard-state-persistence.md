# ADR 0003: Persist current Draft and Published Dashboard states

- Status: Superseded by ADR 0006 in Phase 3
- Date: 2026-08-23

## Context

Phase 2 must move the validated Dashboard model from LocalStorage to PostgreSQL without implementing Phase 3 revision history, ETags, rollback, or conflict resolution. Widget identity, semantic type, schema version, configuration, projection fixture, enabled state, and responsive layout must remain durable.

## Decision

Use four tables:

- `profiles`: structured public identity fields plus JSONB tags.
- `dashboards`: stable UUID identity, owner UUID, profile foreign key, and logical slug.
- `dashboard_states`: exactly one `draft` and one `published` row per Dashboard, each with responsive layout JSONB and a monotonically increasing current-state version.
- `widget_instances`: state-scoped current Widget rows with a stable public `widget_id`, structured `widget_type`, `schema_version`, `enabled`, and JSONB `config` / `projection_data`.

`widget_instances (dashboard_id, state)` has a cascading composite foreign key to `dashboard_states`, so a Widget row cannot outlive or drift away from its owning current state.

`widget_instances` uses a separate row UUID because the same public Widget ID may exist in both current Draft and current Published state. There is no historical state table in Phase 2.

Application writes depend on `DashboardRepository` and `DashboardUnitOfWork`. Save replaces the current Draft atomically. Publish reads and validates Draft, then replaces Published inside one PostgreSQL transaction.

## Alternatives

- Store the entire Dashboard in one JSONB document: rejected because Widget identity, relationships, foreign keys, and indexes would be hidden.
- Introduce `dashboard_revisions` immediately: rejected because revision history belongs to Phase 3.
- Mutate a single shared Widget row from both Draft and Published: rejected because Draft changes could leak into the public view before Publish.

## Consequences

- Current Draft and Published remain isolated without claiming revision history.
- Phase 3 can introduce immutable revision tables behind the repository port without changing DashboardCanvas or the stable HTTP paths.
- Publishing replaces state-scoped rows, but readers never observe an intermediate state because replacement is transactional.
