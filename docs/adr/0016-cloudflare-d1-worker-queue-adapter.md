# ADR 0016 — Cloudflare D1, API Worker, and Queue adapters

## Status

Accepted incrementally.

## Context

The generic Nivalis deployment uses PostgreSQL, Fastify, and a persistent pg-boss Worker. A Cloudflare-native deployment cannot run the pg-boss polling process unchanged, but the existing Application ports allow additional infrastructure adapters.

## Decision

1. PostgreSQL/pg-boss remains the generic reference deployment.
2. Cloudflare D1 is introduced as a SQLite-backed persistence adapter, with its own migrations.
3. A Fetch-native API Worker exposes the existing OpenAPI resource semantics without importing Fastify.
4. Cloudflare Queues implements `SyncJobQueue`; every consumer message is explicitly acknowledged or retried.
5. The first vertical slices are the public Published Dashboard read model, GitHub OAuth/D1 Session, and Owner configuration reads. Owner writes and Provider execution remain unavailable until their D1 adapters are complete.
6. Unimplemented Cloudflare routes return structured Problem Details and never fall back to ephemeral state.

## Consequences

- Pages can be switched from Mock Mode to an actual D1-backed public API.
- PostgreSQL migrations are not reused because D1 follows SQLite semantics.
- Revision CAS and immutable history must be re-proven against D1 before Owner writes are enabled.
- Large Raw Snapshots may require an R2-backed payload adapter if they approach D1 row limits.
