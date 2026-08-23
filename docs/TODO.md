# Delivery TODO

## Phase 2 — API and persistence

- Implement Fastify transport, Application use cases, Kysely repositories, and PostgreSQL migrations.
- Serve the committed OpenAPI contract and add response contract tests.
- Replace `MockDashboardSource` with an `@nivalis/api-client` adapter.

## Phase 3 — revisions

- Persist Dashboard Draft and Published revisions with ETag / `If-Match` concurrency control.
- Add rollback and revision history.

## Phase 4 — synchronization

- Implement pg-boss queue, Worker retry/backoff, raw snapshots, Provider-native records, projections, and sync state.

## Phase 5+

- Implement the Netease Connector first, entirely inside its adapter boundary.
- Add GitHub, Bangumi, Steam, and Bilibili Connectors incrementally.
- Complete Settings persistence, Auth adapter, observability, caching, and production deployment adapters.

No Phase 1 mock is a claimed Provider response, and no production integration is hidden behind the mock boundary.
