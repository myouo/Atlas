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
Queue Consumer boundary
```

Implemented Worker routes:

- `GET /health`
- `GET /ready`
- `GET /v1/public/profile`
- `GET /v1/public/dashboards/about`
- GitHub OAuth start/callback, D1 Session lookup, and logout
- Owner Draft/Live Data and Provider status reads

Other `/v1/*` routes return deployment-neutral Problem Details until their D1 adapters are implemented.

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

## Local D1

```bash
pnpm generate:d1-seed
pnpm d1:migrate:local
pnpm d1:seed:local
pnpm preview:edge
```

The Seed is idempotent and contains only explicit fixture projections. D1 schema changes are formal Wrangler migrations under `edge/migrations`.

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
- WebCrypto credential protection and D1 credential store;
- D1 SyncRun/Raw/Projection repositories;
- Queue Consumer composition with ProviderRegistry and NetEase runtime;
- remote concurrency and migration-preservation tests.

The generic PostgreSQL/Fastify/pg-boss deployment remains supported while these edge adapters are completed.
