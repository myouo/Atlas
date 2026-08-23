# ADR 0001: Contract-first Phase 1 with a mock data-source adapter

- Status: Accepted
- Date: 2026-08-23

## Context

Phase 1 must prove the Widget, Layout, and UI architectures before a database, Fastify API, or Provider Connector exists. The specification also requires OpenAPI to remain the only formal frontend/backend contract.

## Decision

Commit the OpenAPI 3.1 contract and generated framework-neutral API client now. The Web consumes a `DashboardDataSource` interface whose Phase 1 implementation is `MockDashboardSource`; Phase 2 will add an API-backed implementation without changing Dashboard rendering.

Draft and Published snapshots are modeled separately in browser persistence to validate the lifecycle, while server revision history remains a later phase.

## Alternatives

- Import backend TypeScript types into the Web: rejected because it violates the contract boundary.
- Call public Providers directly from the browser: rejected because it violates the Connector and Worker architecture.
- Delay the contract until the backend exists: rejected because it would force the UI mock to invent an unrelated data shape.

## Consequences

- Phase 1 has a little more schema work but validates the true integration seam.
- Mock data stays explicit and replaceable.
- Persistence is single-browser only until the API and database phases.
