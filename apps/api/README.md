# API application

Phase 5 keeps the Fastify process independent from Provider execution and owns authentication:

```text
HTTP → Auth/Dashboard/Connection/Sync Application Services → Ports → Kysely / pg-boss adapters
```

Routes parse and validate HTTP, construct the configured OwnerContext, call Application services, and map responses. They never query Kysely directly, fetch a Provider, or contain Dashboard presentation rules.

Runtime features:

- TypeBox request/response JSON Schema.
- RFC 9457 `application/problem+json` with request IDs.
- Fastify/Pino structured logging with credential-header redaction.
- CORS origin/method allowlists.
- `/health` liveness and `/ready` PostgreSQL readiness.
- API-owned GitHub OAuth code flow with PKCE/state and opaque hashed sessions.
- One Owner authorization/Origin boundary for every `/v1/me/*` resource (`401`/`403`).
- Write-only NetEase credential API backed by AEAD ciphertext; secrets are never returned.
- Contract-first QR/SMS AuthAttempt endpoints; phone/code fields are write-only and Provider I/O remains queued for Worker.
- Strong Revision ETags, required `If-Match`, `412` conflict, and `428` missing precondition responses.
- Cursor history, immutable revision detail, and non-destructive Restore.
- Configuration-only Draft responses with `rev:` ETags, live-data responses with `data:` ETags, and aggregate public responses with `view:` ETags.
- Durable `202 Accepted` SyncRun resources; Provider I/O remains exclusively in the Worker.

Run from the repository root:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

`pnpm --filter @nivalis/api build` first runs strict TypeScript validation, then emits the Node.js runtime bundle. Start the compiled API with:

```bash
pnpm --filter @nivalis/api start
```

The compiled database CLI is emitted at `apps/api/dist/cli/database.js`; normal repository workflows should continue to use the root `pnpm db:*` commands.

The API creates/deduplicates SyncRuns and enqueues pg-boss jobs in one transaction; it never invokes a Connector. NetEase HTTP and decryption are Worker responsibilities. Automatic merge, revision pruning, appearance persistence, and additional Providers remain intentionally unimplemented. Database migration rollback and Dashboard Revision Restore are separate operations.
