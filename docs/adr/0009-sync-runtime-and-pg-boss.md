# ADR 0009: Use a public SyncRun model behind a pg-boss queue port

- Status: Accepted
- Date: 2026-08-24

## Context

Phase 4 must prove a durable asynchronous Provider pipeline without coupling API contracts or Application services to pg-boss. The API and Worker are independent processes. Queue delivery must be treated as at-least-once by Nivalis even if the current queue offers stronger delivery guarantees.

No real Provider credentials or HTTP integrations are in scope. A deterministic Fixture runtime must exercise fetch, sanitization, Raw Snapshot persistence, normalization, projection, retry, failure, and read-model invalidation end to end.

## Decision

Introduce the public business resource `SyncRun`:

```text
id (public UUID)
provider / provider_connection_id
status: queued | running | retry_wait | completed | failed
attempt_count
requested / started / finished timestamps
last safe error code/message
queue_job_id (nullable infrastructure metadata only)
```

Clients receive only the SyncRun UUID as `jobId`. pg-boss IDs never enter OpenAPI.

Application depends on these ports:

- `SyncRepository` for runs, states, connections, and Raw Snapshots
- `ProjectionRepository`
- `SyncJobQueue`
- `ProviderRuntimeRegistry`
- transaction/unit-of-work boundaries

Infrastructure implements `SyncJobQueue` with pinned pg-boss 12.27.x. Queue creation uses bounded retry configuration, exponential backoff, maximum delay, heartbeat, expiration, and retention. Nivalis attaches an error listener as required by current pg-boss behavior. API enqueues; only `apps/worker` registers `work()` handlers. Official pg-boss lifecycle/schema migration stays inside the queue adapter and its dedicated `pgboss` PostgreSQL schema.

The API transaction creates or reuses one active SyncRun per Provider connection and enqueues its message through the transaction-aware queue adapter. A partial unique index on active statuses enforces deduplication. Four rapid requests therefore return the same public SyncRun.

## Worker pipeline

```text
claim SyncRun / increment attempt
        ↓
ProviderRuntimeRegistry
        ↓
Connector fetches sanitized payload
        ↓
defensive credential-key sanitizer
        ↓
immutable Raw Snapshot commit
        ↓
Normalizer
        ↓
Projector builds all outputs in memory
        ↓
atomic Projection + SyncState + SyncRun success commit
```

The Fixture Provider is enabled only in development/test configuration and is forcibly unavailable in production. It supports deterministic success, retry-then-success, permanent failure, normalization failure, and projection failure scenarios for tests. No real network Provider is contacted.

Errors are semantic:

- `RetryableProviderError`: mark `retry_wait`; throw while attempts remain so pg-boss schedules bounded retry.
- `PermanentProviderError`: one attempt, mark failed, do not retry.
- `NormalizationError`: persist any already-created Raw Snapshot, mark failed, preserve projections.
- `ProjectionError`: preserve Raw Snapshot and Last Known Good projections, mark failed.

The final retry attempt marks the SyncRun failed. Queue redelivery of a completed run is a no-op. Raw snapshots use `(sync_run_id, payload_hash)` uniqueness, and projections upsert by `(widget_id, projection_key)`, making the pipeline idempotent. pg-boss heartbeats keep healthy long-running work leased; after a crashed process and job expiration, Application can reclaim only a stale `running` SyncRun lease.

## Runtime independence

- Worker start/stop is independent of Fastify lifecycle.
- A queued job survives both API and Worker process restarts because it is stored in PostgreSQL.
- API shutdown does not interrupt a Worker processing an already queued run.
- Frontend polling uses SyncRun states and invalidates only Provider status and live projection queries; local dirty Draft state is untouched.

## Alternatives

- Expose pg-boss job rows directly: rejected because it prevents queue replacement and leaks infrastructure semantics.
- Fetch Providers in Fastify handlers: rejected because request latency and availability would depend on external APIs.
- Use Redis/BullMQ, Kafka, or RabbitMQ now: rejected because PostgreSQL already provides the required durability at this scale.
- Enable a real Netease/GitHub Connector: rejected because Phase 4 validates runtime architecture, not Provider adapters or credentials.

## Consequences

- pg-boss can later be replaced behind `SyncJobQueue` without changing Application or Web contracts.
- The database gains a separately managed `pgboss` schema plus Nivalis-owned Sync/Raw/Projection tables.
- Retry timing is bounded and configurable; tests use shorter safe values without weakening production defaults.
- Sync runtime correctness is test-heavy and intentionally adds little permanent Homepage UI.
