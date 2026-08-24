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
7. Pages Functions owns a same-origin `/api/*` proxy to the API Worker through a Service Binding, so OAuth Session cookies are first-party to the public site.

## Phase 5 extension (2026-08-25)

The incremental adapter now includes D1-backed Provider connections, AEAD credentials, ephemeral Provider AuthAttempts, SyncRuns, Provider sync state, sanitized Raw Snapshots, and Last Known Good projections. Cloudflare Queue messages use an explicit discriminated envelope for `sync` and `provider_auth`; only Nivalis UUIDs cross the queue boundary.

The adapter also implements immutable Draft save and Published-pointer updates for the existing OpenAPI endpoints. Draft writes use `D1Database.batch()` as one SQLite transaction and finish with a conditional `current_draft_revision_id = expected` compare-and-swap. Presentation-only edits therefore receive the same Revision ETag conflict protection as layout edits. Revision list/detail/restore remain separate incremental adapter work.

ETag-bearing JSON responses include `Cache-Control: no-transform`. Without that directive, Pages/edge compression weakens a strong `"rev:..."` validator to `W/"rev:..."`, which is invalid for standard `If-Match` strong comparison. The adapter does not relax `If-Match`; it prevents the intermediary transformation instead.

NetEase QR/SMS authentication continues to use the provider-neutral services from ADR 0014. To avoid adding the Queue batch delay to an interactive login, the Cloudflare fetch adapter persists the attempt, returns `202`, and registers its first `ProviderAuthWorkerService.process()` call with `ExecutionContext.waitUntil()`. The same service sends subsequent QR polls and retry fallback through Cloudflare Queues; credential extraction and persistence never move into the route or browser. A queued attempt with no recorded error can be restarted by a later Owner status read if the original isolate is interrupted. The consumer uses `max_batch_size: 1` and `max_batch_timeout: 0` because authentication messages are latency-sensitive and are not aggregated.

Runtime compatibility also required two transport-level changes inside the NetEase Connector only:

- inspect redirects with Fetch `manual` mode and explicitly reject 3xx responses, because edge Fetch does not implement `redirect: "error"`;
- invoke the default transport through a `globalThis.fetch` closure so Workerd receives the correct function receiver.

These changes do not move Provider HTTP behavior into the API route, browser, Dashboard service, or Revision model.

## Consequences

- Pages can be switched from Mock Mode to an actual D1-backed public API.
- PostgreSQL migrations are not reused because D1 follows SQLite semantics.
- Revision CAS and immutable history must be re-proven against D1 before Owner writes are enabled.
- Large Raw Snapshots may require an R2-backed payload adapter if they approach D1 row limits.
- The D1 NetEase slice currently persists account-native metadata and projections; the complete PostgreSQL native track/listen model and replay CLI remain future adapter work.
