# ADR 0004: Kysely migrations with an isolated PostgreSQL test database

- Status: Accepted
- Date: 2026-08-23

## Context

Phase 2 requires real PostgreSQL behavior, deterministic schema changes, idempotent fixtures, contract tests through Fastify, and a CI strategy that does not depend on a developer's database.

## Decision

- Use Kysely's `Migrator` and committed migration modules under `migrations/`.
- Never create or alter application tables during API startup.
- Provide explicit `db:migrate`, `db:migrate:status`, `db:rollback`, and `db:seed` commands.
- Use `DATABASE_URL` for normal commands and `TEST_DATABASE_URL` for isolated integration runs.
- CI provisions an ephemeral PostgreSQL service and runs migrations, idempotent seed, repository integration tests, API contract tests, and API-mode Playwright against it.
- Integration tests run sequentially and reset only their ephemeral test data. They refuse to run without a test connection string.

## Alternatives

- SQLite or an in-memory SQL fake for integration tests: rejected because PostgreSQL JSONB, constraints, transactions, and driver behavior must be exercised.
- Application-startup `CREATE TABLE IF NOT EXISTS`: rejected because schema mutation would become implicit and unauditable.
- A developer-shared test database: rejected because tests would not be isolated or reproducible.

## Consequences

- Unit tests remain fast through a fake repository, while integration and contract tests prove real database behavior.
- Local contributors need PostgreSQL or another compatible isolated test environment for integration/E2E tests.
- Database vendors remain interchangeable because only a standard PostgreSQL connection URL enters configuration.
