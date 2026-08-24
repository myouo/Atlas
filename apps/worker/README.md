# Synchronization Worker

The Worker is an independent Node.js process that consumes durable pg-boss jobs and executes:

```text
ProviderRuntimeRegistry
  ↓ Connector
sanitized immutable Raw Snapshot
  ↓ Normalizer
normalized in-memory Provider data
  ↓ Projector
atomic Last Known Good Widget projections + sync state
```

Phase 5 retains `FixtureProviderRuntime` for development/test and adds `NeteaseProviderRuntime`. NetEase credentials are resolved and decrypted behind an Application port; the Worker never parses a browser payload or exposes the credential. Provider transport is sequential, read-only, time-bounded, and produces sanitized source-kind snapshots before runtime validation. Retryable failures use bounded pg-boss exponential backoff, while credential, permanent, schema, normalization, projection, and sanitization failures stop immediately.

`NeteaseAuthClient` also consumes the separate `nivalis-provider-auth` queue. QR and SMS jobs carry only an AuthAttempt UUID, decrypt short-lived state inside the Worker, discard full login Cookie headers after extracting `MUSIC_U`, and then reuse the normal encrypted connection plus validation Sync path.

Run after Migration and Seed:

```bash
pnpm dev:worker
```

Build and smoke-test the independent process:

```bash
pnpm --filter @nivalis/worker build
DATABASE_URL=... pnpm test:smoke:worker
```

Replay sanitized NetEase evidence (dry-run by default):

```bash
pnpm provider:replay --provider netease --snapshot <uuid>
pnpm provider:replay --provider netease --snapshot <uuid> --commit
```

The sanitized NetEase HTTP transport fixture requires `NETEASE_HTTP_FIXTURE_ENABLED=true`, is disabled by default, and is rejected in production.

The Worker imports Application ports/services and a narrow exported PostgreSQL/queue composition surface. It does not import Fastify routes and cannot create Dashboard Revisions. Successful Native/Projection commits and replay commits leave Draft/Published pointers and Revision history untouched.
