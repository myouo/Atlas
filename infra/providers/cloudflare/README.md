# Cloudflare deployment adapters

Cloudflare remains infrastructure, not a business dependency. Account IDs, generated hostnames, D1 IDs, and credentials are never committed.

## Current vertical slice

```text
Cloudflare Pages
       ↓ same-origin /api
Pages Function
       ↓ Worker Service Binding
Fetch-native API Worker
       ↓
DashboardReadService
       ↓
D1 Reader / Projection Hydrator

SyncJobQueue Port
       ↓
Cloudflare Queue Adapter
       ↓
Queue Consumer
       ↓
ProviderAuthWorkerService / NeteaseProviderRuntime
       ↓
Sanitized Raw Snapshot + Last Known Good Projection
```

Implemented Worker routes:

- `GET /health`
- `GET /ready`
- `GET /v1/public/profile`
- `GET /v1/public/dashboards/about`
- GitHub OAuth start/callback, D1 Session lookup, and logout
- Owner Draft/Live Data and Provider status reads
- encrypted NetEase `MUSIC_U` connect/disconnect and connection metadata
- NetEase QR/SMS AuthAttempt creation, polling, verification, and cancellation
- SyncRun enqueue/status, Queue consumption, Raw Snapshot persistence, and Projection replacement

Other unported `/v1/*` routes return deployment-neutral Problem Details rather than falling back to ephemeral state.

Anonymous visitors receive a content-only homepage. The mode switcher, editing chrome, status/sync/API actions, Settings link, phase badge, and operational footer are rendered only after an Owner session is returned. Owner authentication is entered by navigating directly to `/settings`.

## GitHub Owner authentication

Create a GitHub OAuth App with this exact callback shape:

```text
<pages-origin>/api/v1/auth/github/callback
```

Configure these Worker values through deployment variables/secrets, never source:

```text
APP_PUBLIC_ORIGIN
API_PUBLIC_ORIGIN
OWNER_GITHUB_USER_ID
NIVALIS_OWNER_ID
NIVALIS_CREDENTIAL_KEY_ID
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
NIVALIS_CREDENTIAL_MASTER_KEY
```

OAuth state/PKCE material is short-lived and AEAD-encrypted in D1. Session cookies are opaque, HttpOnly, Secure, and SameSite=Lax; only the token hash is stored. GitHub access tokens are used once to read the stable numeric user ID and are never persisted.

## NetEase Provider runtime

Cloudflare D1 stores Provider connection metadata, encrypted credentials, ephemeral AuthAttempts, SyncRuns, sanitized Raw Snapshots, sync state, and the latest NetEase account projection. `MUSIC_U`, QR private state, phone numbers, and submitted SMS codes are protected with AES-256-GCM and contextual associated data. Terminal or cancelled AuthAttempts erase their encrypted state.

Provider authentication remains owned by `ProviderAuthWorkerService`: the API persists an AuthAttempt, returns `202` immediately, and starts its first step with `ExecutionContext.waitUntil()`. QR polling, retry fallback, and credential extraction use the Cloudflare Queue adapter, whose messages contain only the attempt UUID. The consumer uses single-message batches with zero batch wait so interactive work is delivered immediately; the browser polls only Nivalis. The Connector uses manual redirect inspection because edge Fetch implementations do not universally implement `redirect: "error"`, and the default transport is wrapped through `globalThis.fetch` to preserve the required runtime receiver.

Settings prewarms one QR AuthAttempt 250 ms after the API-backed QR panel becomes eligible. This moves the unstable Provider latency before the Owner's explicit QR interaction, while the existing single-active-attempt rule still deduplicates refreshes. Switching to SMS or manual Cookie first cancels the prewarmed attempt, so prewarming cannot race a different credential method.

Fixture transport is accepted only when `ENVIRONMENT=test` and `NETEASE_HTTP_FIXTURE_SCENARIO` names a sanitized scenario. Preview/production deployments reject fixture transport.

## Local D1

```bash
pnpm generate:d1-seed
pnpm d1:migrate:local
pnpm d1:seed:local
pnpm preview:edge
```

The Seed is idempotent and contains only explicit fixture projections. Its NetEase row is an all-unavailable placeholder and uses `ON CONFLICT DO NOTHING`, so rerunning development Seed cannot overwrite a successfully synchronized real NetEase projection. D1 schema changes are formal Wrangler migrations under `edge/migrations`.

## Remote deployment

```bash
pnpm deploy:edge
pnpm d1:migrate:remote
pnpm d1:seed:remote
```

Wrangler automatic provisioning creates and links the D1/Queue resources without committed instance IDs. `CORS_ORIGINS` is injected as a deployment variable.

Build Pages in API Mode by injecting the Worker origin at build time:

```bash
NEXT_PUBLIC_DASHBOARD_SOURCE=api \
NEXT_PUBLIC_API_BASE_URL=<pages-origin>/api \
CLOUDFLARE_PAGES_PROJECT=<project> \
pnpm deploy:pages
```

## Remaining adapter work

- immutable D1 Revision write/CAS operations;
- full NetEase native track/listen history tables in the D1 adapter;
- D1 Raw Snapshot replay/commit tooling;
- remote concurrency and migration-preservation tests.

The generic PostgreSQL/Fastify/pg-boss deployment remains supported while these edge adapters are completed.
