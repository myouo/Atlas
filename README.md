# Nivalis About Me

Nivalis is a personal digital identity, multi-provider data aggregation, and composable Dashboard system.

Phase 5 installs the first real, read-only Provider module plus Worker-owned QR/SMS login without coupling external data to immutable Dashboard configuration:

```text
Generic:    Web → Fastify → Application ports → PostgreSQL
                                     └→ pg-boss → Node Worker

Cloudflare: Pages → API Worker → Application reader ports → D1
                                      └→ Queue → Consumer Worker
```

Owner configuration and Provider data remain independent. A sync can change `data:` and `view:` ETags, but never creates a Revision, moves Draft/Published pointers, or changes a `rev:` ETag.

Read [the implementation specification](docs/NIVALIS_ABOUTME_IMPLEMENTATION_SPEC.md), [architecture guide](docs/ARCHITECTURE.md), and [ADRs](docs/adr/) before changing boundaries.

## Requirements

- Node.js 24 LTS
- pnpm 11+
- PostgreSQL 18 for the generic Node deployment, or Cloudflare D1 for the edge adapter
- A GitHub OAuth App for a real Owner deployment
- A 32-byte credential master key
- NetEase App QR scan, SMS OTP, or an existing `MUSIC_U` value configured through Settings

No real Provider credential is required for normal development or CI. Sanitized NetEase fixtures cover the complete Connector/Raw/Native/Projection pipeline.

## Install

```bash
pnpm install --frozen-lockfile
pnpm generate
```

## Mock Mode

Mock Mode needs no API or database and remains the default:

```dotenv
NEXT_PUBLIC_DASHBOARD_SOURCE=mock
NEXT_PUBLIC_API_BASE_URL=
```

```bash
pnpm dev:web
```

For a repeatable full frontend preview, use the explicit launcher:

```bash
pnpm preview:web
```

Open `http://127.0.0.1:3000`. The launcher starts Next.js plus a loopback-only, in-memory Nivalis
Preview API. The Preview API reads `NETEASE_INTEGRATION_MUSIC_U` only on the server, runs the real
Connector → Normalizer → Projector pipeline, and combines those projections with a repository-owned
local Dashboard fixture/layout. The browser never receives the Cookie. GitHub, Bilibili, Steam, and
Bangumi remain explicitly marked Fixture data until their real Connectors exist. It does not call any
Nivalis deployment, Pages site, API Worker, D1, Queue, or database.

Configure the ignored root `.env.local`:

```dotenv
NETEASE_INTEGRATION_MUSIC_U=<MUSIC_U value only>
```

The local API returns an Owner fixture session, so display/edit controls, drag, resize, add/remove,
responsive layouts, and in-memory save/publish are available. The Sync button refreshes real NetEase
data in memory without touching production. Draft dataConfig changes are immediately re-projected in
memory, so stale LocalStorage or an older compatible Draft cannot make Owner loading disappear. To
use other local ports:

```bash
NIVALIS_PREVIEW_PORT=3100 NIVALIS_PREVIEW_API_PORT=4274 pnpm preview:web
```

Starting the command twice no longer throws an unhandled port error. If the existing local Nivalis
preview owns both ports, the second command reports its URL and exits successfully. If unrelated
processes own either port, the launcher identifies the conflicting port and asks for another pair.

Use a private browser window or clear the `nivalis.dashboard.v3` LocalStorage key when you want a
fresh preview Draft.

It keeps the lightweight LocalStorage Draft/Published model for UI development and does not call any Provider.

Provider authentication is intentionally disabled in Mock Mode. QR/SMS/manual credential controls do not simulate success; use a fully configured API Mode for real NetEase login.

## API Mode

Create an untracked `.env.local`; `.env.example` intentionally contains keys only. A safe local/test setup resembles:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nivalis
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nivalis_test
APP_PUBLIC_ORIGIN=http://127.0.0.1:4173
API_PUBLIC_ORIGIN=http://127.0.0.1:3001
API_HOST=127.0.0.1
API_PORT=3001
CORS_ORIGINS=http://127.0.0.1:4173
NIVALIS_OWNER_ID=00000000-0000-4000-8000-000000000001
OWNER_GITHUB_USER_ID=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
NIVALIS_CREDENTIAL_MASTER_KEY=
NIVALIS_CREDENTIAL_KEY_ID=primary
AUTH_SECURE_COOKIES=false
FIXTURE_PROVIDER_ENABLED=true
NETEASE_PROVIDER_ENABLED=true
PROVIDER_AUTH_QR_TTL_SECONDS=180
PROVIDER_AUTH_SMS_TTL_SECONDS=300
PROVIDER_AUTH_LEASE_SECONDS=20
PROVIDER_AUTH_QR_POLL_SECONDS=2
PROVIDER_AUTH_SMS_RESEND_SECONDS=30
NEXT_PUBLIC_DASHBOARD_SOURCE=api
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
```

Generate a new local master key without committing it:

```bash
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'
```

For a real OAuth App, configure its callback as:

```text
${API_PUBLIC_ORIGIN}/v1/auth/github/callback
```

Set `OWNER_GITHUB_USER_ID` to the stable numeric GitHub user ID, not a username. GitHub’s access token is used only to resolve `/user` during login and is not stored. Nivalis issues its own opaque HttpOnly session; only its hash is persisted.

Local/test-only identity and transport fixtures may be enabled explicitly:

```dotenv
AUTH_OAUTH_FIXTURE_ENABLED=true
NETEASE_HTTP_FIXTURE_ENABLED=true
NETEASE_HTTP_FIXTURE_SCENARIO=normal
```

Both fixture switches are rejected in production. `NETEASE_HTTP_FIXTURE_SCENARIO` supports `normal`, `credential_expired`, and `schema_drift`.

Start the system:

```bash
pnpm db:migrate
pnpm db:migrate:status
pnpm db:seed
pnpm dev
```

`pnpm dev` starts independent Web, API, and Worker processes. Open Settings, authenticate as Owner, then choose QR scan, SMS OTP, or manual `MUSIC_U`. The browser talks only to Nivalis. Provider login I/O runs in the Worker; full Cookie collections are discarded after extracting `MUSIC_U`. The API never returns it.

### NetEase login methods

- **QR (recommended):** Worker creates and polls a short-lived QR attempt. Scan with the NetEase App and confirm. Status survives API/Worker restart.
- **SMS OTP:** Phone and submitted code are stored only as short-lived AES-GCM envelopes. Public responses expose a masked number.
- **Manual Cookie:** Paste only the value after `MUSIC_U=`. This remains the fallback when Provider login endpoints drift.

Only one active login attempt is permitted per Owner. A competing manual credential write returns `409` until the attempt is completed, expired, or explicitly cancelled. Terminal attempts erase their encrypted state. Password/MD5 login is intentionally unsupported.

Disconnect is durable across refresh/restart: it cancels pending QR/SMS attempts, records a disable timestamp, and prevents any older in-flight attempt from re-enabling the connection. Last Known Good data is retained but becomes stale, and the old Provider account identity is hidden.

## Database commands

```bash
pnpm db:migrate
pnpm db:migrate:status
pnpm db:rollback
pnpm db:seed
```

Application startup never creates tables. Seed is idempotent, development-only, contains no Provider credential, and resets the reproducible Dashboard fixture.

- `001`: Phase 2 current Dashboard state.
- `002`: immutable Revisions and Draft/Published pointers.
- `003`: projection extraction, SyncRun, Raw Snapshot, and pg-boss runtime.
- `004`: Owner Auth/session, AEAD credentials, NetEase native tables, `source_kind`, config split, and NetEase Widget v2 upgrade.
- `005`: encrypted, expiring Provider AuthAttempt state for QR and SMS login.
- `006`: Owner-only Provider data catalog plus total-duration native metric support.
- `007`: immutable current-Revision upgrade from single-range ranking/single-item pseudo-showcase to dual ranking and a manually curated six-item gallery.

Migration rollback and user-facing Revision Restore are unrelated operations. Migration `004` preserves v1 history and creates immutable `schema_upgrade` successors for current NetEase Widget configurations.

## Provider replay

Replay operates on every sanitized Raw Snapshot from the selected SyncRun. It uses current validators, normalizer, and projector:

```bash
pnpm provider:replay --provider netease --snapshot <uuid>
```

The default is a dry run that prints normalized output, projections, and a create/replace/unchanged diff. Only an explicit development command commits derived state:

```bash
pnpm provider:replay --provider netease --snapshot <uuid> --commit
```

Commit updates Native/Projection data in one transaction. Replay never creates a Dashboard Revision and is refused by this CLI in production.

## Optional real Provider test

For fast music-card verification, no database, API, Worker, Queue, migration, or deployment is
required. Put the credential only in the ignored repository-root `.env.local`:

```dotenv
NETEASE_INTEGRATION_MUSIC_U=<MUSIC_U value only>
```

Then run the focused probe:

```bash
pnpm test:netease:cards
```

It reuses the production `NeteaseClient` and Runtime Schemas, calls only account, Exhibition Window,
and batched song-detail reads, and prints a sanitized ordered summary containing titles and artists.
It never prints IDs, URLs, Raw payloads, or the credential. A database-free deterministic check is:

```bash
pnpm test:netease:cards --fixture
```

Use this probe before deploying any future music-card transport or normalization change.

Ordinary CI uses sanitized fixtures only. A real read-only contract test runs only when both variables are supplied explicitly outside Git:

```dotenv
NETEASE_INTEGRATION_TEST=1
NETEASE_INTEGRATION_MUSIC_U=
```

```bash
pnpm test:provider
```

The NetEase integration is deliberately read-only but now covers account/profile identity, level progress, VIP tiers, Provider-reported cumulative listening duration, weekly and all-time rankings, recent songs, weekly listening reports, bounded following/follower lists, created playlists, social status, obtained/worn badges, and the official Exhibition Window music-card read model. The ordered Provider arrangement comes from `/api/user/page/window/get` (`open`, `cardLimit`, `cardVOList`); generic Profile V3 blocks remain supplemental data and historical-replay fallback, never the current six-card selector. It performs no Provider write, password login, IP spoofing, proxy rotation, or region bypass.

After one successful sync, Settings exposes an authenticated **网易云完整数据** catalog. This is a normalized allowlist—not Raw Snapshot data—and never includes credentials, headers, login IPs, or other private Provider fields. Owner edit mode offers semantic public policies for NetEase identity, listening, ranking, social, playlist, and showcase cards. Public scope is enforced while building the Projection; display-only switches are not treated as privacy controls.

The preferred ranking card contains both the recent-week and all-time Provider rankings, switches locally, and pages rows without a nested native scrollbar. The preferred music showcase follows up to six publicly eligible Provider-ordered personal-home cards by default, while an explicit Nivalis custom mode can compose at most six Owner-catalog resources. Provider-private cards remain Owner-only unless explicitly selected; neither mode auto-promotes the first listening-history record.

## Test database and quality gates

The integration database name must contain `test`. CI provisions its own ephemeral PostgreSQL service.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:contract
pnpm test:concurrency
pnpm test:migration
pnpm test:sync-runtime
pnpm test:provider
pnpm build
pnpm test:smoke:api
pnpm test:smoke:worker
pnpm test:e2e
pnpm test:e2e:api
```

The gates cover OAuth owner/viewer boundaries, session logout, QR/SMS state transitions, Worker restart recovery, masked/write-only inputs, terminal secret erasure, AEAD/tamper/wrong-key behavior, ciphertext-only persistence, schema drift, credential expiry, Native idempotency, Last Known Good, replay, revision isolation, generated-client determinism, and the real pg-boss Worker path.

## Health

- `GET /health`: process liveness only.
- `GET /ready`: configured persistence reachability only; OAuth and Provider availability do not affect readiness.

## Cloudflare D1/API Worker deployment

Cloudflare remains optional infrastructure. The current vertical slice serves the public Published Dashboard from D1 through a Fetch-native API Worker:

```bash
pnpm generate:d1-seed
pnpm d1:migrate:local
pnpm d1:seed:local
pnpm preview:edge

pnpm deploy:edge
pnpm d1:migrate:remote
pnpm d1:seed:remote

NEXT_PUBLIC_DASHBOARD_SOURCE=api \
NEXT_PUBLIC_API_BASE_URL=/api \
CLOUDFLARE_PAGES_PROJECT=<project> pnpm deploy:pages
```

- D1 has independent SQLite migrations and an idempotent fixture Seed.
- `/health`, `/ready`, public Profile/Dashboard, GitHub OAuth/D1 Session, immutable Draft save/Publish, Owner reads, Provider connection resources, and `GET /v1/me/providers/netease/data` are implemented.
- Cloudflare Queues carries both SyncRun and Provider AuthAttempt UUID envelopes with explicit per-message ack/retry behavior.
- D1 stores AEAD-encrypted NetEase credentials, ephemeral QR/SMS state, SyncRuns, sync state, sanitized Raw Snapshots, the Owner-only data catalog, and Last Known Good projections.
- Revision history/detail/restore, granular Widget routes, and the full NetEase relational native history/replay adapter remain incomplete on D1 and continue to return Problem Details where applicable.
- The PostgreSQL/Fastify/pg-boss implementation remains available and fully tested.
- No Cloudflare account, domain, project endpoint, or secret is committed.

See [ADR 0016](docs/adr/0016-cloudflare-d1-worker-queue-adapter.md) and the [Cloudflare adapter guide](infra/providers/cloudflare/README.md).

The public homepage intentionally has no administration chrome. Open `/settings` directly to authenticate as Owner; the display/edit controls, Provider status, sync actions, API information, and Settings link appear on the homepage only after the API reports an Owner session.

In Owner edit mode, every registered card uses the shared configuration surface. Presentation choices update only `presentationConfig`; NetEase semantic public policies update `dataConfig` and are enforced by the Projector before data reaches a public payload. Use **Save Draft**, sync data-affecting policy changes, then **Publish Layout**. Presentation choices do not change Projection Keys; public policy and selected resources do.

Cloudflare Pages Functions proxies `/api/*` to the API Worker through a Service Binding. OAuth callback and Session cookies therefore stay on the Pages origin instead of relying on cross-site `pages.dev` → `workers.dev` cookies.

The API-backed Dashboard revalidates on a 30-second foreground interval and whenever the browser window regains focus. Projection refreshes merge only live Provider data into a dirty local Draft; layout, Widget configuration, and the `rev:` concurrency token remain untouched.

## Security

Assume this repository is public:

- Never commit `.env`, OAuth secrets, Provider cookies/tokens, master keys, real domains, or deployment instance identifiers.
- All `/v1/me/*` routes use one API-owned authentication/authorization boundary.
- ETags prevent lost updates; they do not replace authorization.
- Pino redacts Cookie, Authorization, and credential-body paths.
- Raw Snapshots are insert-only, recursively checked, and receive Connector-sanitized Provider payloads only.
- Phone, OTP, QR private state, and login Cookie headers never enter Raw Snapshots or queue payloads.
- Disconnect deletes the credential and disables the connection; it intentionally does not destroy historical Raw/Native/Projection data.

## Phase status

- Phase 1: renderer, Widget/Layout architecture, responsive editing, Mock source.
- Phase 2: Contract-first API and PostgreSQL persistence.
- Phase 3: immutable revisions, optimistic concurrency, history, and Restore.
- Phase 4: async Worker, Raw Snapshot, Projection, retry/LKG, and revision isolation.
- Phase 5: API-owned Owner Auth, encrypted Provider credentials, Worker-owned QR/SMS login, read-only NetEase module, Native model, Widget v2, schema drift, and replay.
- Phase 6+: additional Providers remain intentionally out of scope. See [TODO](docs/TODO.md).

Visual regressions are enforced through component tests and Playwright rather than committed screenshot artifacts.
