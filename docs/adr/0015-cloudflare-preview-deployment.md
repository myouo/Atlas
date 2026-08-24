# ADR 0015 — Cloudflare preview deployment without runtime substitution

## Status

Superseded by ADR 0016 after the user explicitly selected D1 and Cloudflare Queues as additional infrastructure adapters. This ADR remains as the record of the original static-only preview decision.

## Context

Nivalis currently has three independent runtime processes:

- Next.js Web;
- Fastify API backed by PostgreSQL;
- a persistent Node Worker consuming pg-boss jobs from PostgreSQL.

Cloudflare Pages supports a static Next.js export. Cloudflare Workers runs request/event-driven isolates and does not provide a permanently polling Node process. Deploying the existing API or pg-boss Worker unchanged would either fail at runtime or create misleading ephemeral state. Replacing PostgreSQL with D1 or pg-boss with an in-memory queue would violate established Application ports and persistence guarantees.

## Decision

The first Cloudflare deployment is deliberately split:

1. Pages receives a static Next.js export built in explicit Mock Mode for public visual and interaction QA.
2. A Fetch-native Edge Gateway Worker provides infrastructure liveness and an optional proxy boundary for a separately deployed Nivalis API.
3. The gateway returns `503` Problem Details when no API origin is configured. It never manufactures Dashboard or Provider responses.
4. No Cloudflare Account ID, generated hostname, database endpoint, or secret is committed.
5. The generic Node API/Worker/PostgreSQL architecture remains the production-capable source of truth.

## Alternatives

### Deploy Fastify and pg-boss directly to Workers

Rejected. The API starts a Node HTTP listener, and pg-boss expects a durable polling process. Workers uses Fetch/event handlers and isolates.

### Replace PostgreSQL with D1 for the preview

Rejected. This would be a persistence rewrite, not a deployment adapter, and would invalidate the tested Kysely/PostgreSQL migration and concurrency behavior.

### Pretend the Mock source is a deployed API

Rejected. Provider login and persistence would appear functional without the security and durability guarantees implemented in Phases 2–5.

## Consequences

- The Pages URL is immediately useful for design and Mock interaction testing.
- The Edge Worker can be tested independently through `/health` and explicit not-ready behavior.
- Real Owner Auth, PostgreSQL persistence, QR/SMS login, and Provider sync require a separately reachable Node runtime until a future Cloudflare Queue/Hyperdrive or Container adapter is deliberately implemented and recorded.
