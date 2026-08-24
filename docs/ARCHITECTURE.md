# Architecture

## Invariants

Nivalis uses a frontend-independent API, a modular monolith, a separate synchronization Worker, and replaceable Provider Connectors. The browser never calls a Provider, contains no Provider credential, and never imports backend internals. OpenAPI is the only formal cross-system contract.

```text
Third-party Provider
        ↓
Connector adapter
        ↓
Async Worker / queue
        ↓
Raw → native → projection data
        ↓
Nivalis REST API
        ↓
@nivalis/api-client
        ↓
Replaceable Web renderer
```

## Phase 1 runtime

Phase 1 intentionally replaces the API implementation with `MockDashboardSource`, behind the same `DashboardDataSource` port that a generated-client adapter will implement in Phase 2. Mock records are marked in the UI and do not claim to originate from a Provider.

Mock Mode never performs or simulates Provider authentication. Settings renders an explicit API-mode requirement instead of advancing fake QR/SMS attempts to `connected`; this prevents module/HMR state from being mistaken for a durable credential lifecycle.

```text
AboutPage
├── TopActionBar
└── DashboardCanvas (shared by display and edit)
    ├── responsive layout engine
    ├── WidgetRegistry (type + schemaVersion)
    └── ModuleShell
        └── Widget renderer
```

The persisted browser model keeps `draft` and `published` layout snapshots separate. Saving a draft does not publish it; publishing is explicit. This local model is a UI prototype of the future server revision model, not a substitute for it.

## Phase 2 data flow

```text
Next.js composition root
        ↓ DashboardDataSource
MockDashboardSource ───────────────┐
                                   ├→ AboutPage / TanStack Query
NivalisApiDashboardSource          │          ↓
        ↓                          └→ Zustand local edit state
@nivalis/api-client
        ↓ HTTP / OpenAPI 3.1
Fastify transport
        ↓
DashboardService (Application)
        ↓
DashboardRepository + DashboardUnitOfWork ports
        ↓
KyselyDashboardRepository
        ↓
PostgreSQL
```

Only the composition root selects Mock or API mode. UI components never branch on Fastify, Kysely, PostgreSQL, or database schema.

TanStack Query owns API loading and mutation state. Zustand owns the current local editing Draft and UI interaction state. Drag/Resize changes never issue network requests; explicit Save sends one complete current Draft. Save failure leaves the local Draft and dirty flag intact.

### Current-state persistence

Phase 2 persists exactly one current `draft` and one current `published` state:

```text
dashboards
├── dashboard_states(state=draft)
│   └── widget_instances(state=draft)
└── dashboard_states(state=published)
    └── widget_instances(state=published)
```

`profiles`, `dashboards`, state identity, Widget identity/type/schema version/enabled state, foreign keys, timestamps, and sort order are structured columns. Layout, Widget config, tags, and Fixture projection data use JSONB at their flexible boundaries.

Save and Publish execute behind `DashboardUnitOfWork`. Publish reads and validates Draft, replaces Published, and commits as one PostgreSQL transaction. Phase 2 does not claim revision history: the integer `revision` is only the monotonically increasing version of the current state.

## Phase 3 immutable revision flow

Phase 3 retires `dashboard_states` and `widget_instances` after a preserving migration:

```text
dashboards
├── current_draft_revision_id ────────┐
├── current_published_revision_id ────┤
└── next_revision_number              │
                                      ↓
dashboard_revisions (insert-only full layout snapshots)
        ↓
dashboard_revision_widgets (insert-only Widget snapshots)
        ↓
widgets (stable logical identity)
```

Every content mutation uses a semantic expected revision UUID behind `DashboardRepository`:

```text
If-Match strong ETag
        ↓ Transport parses UUID
Application expectedRevisionId
        ↓ Unit of Work
conditional Dashboard row update / revision-number allocation
        ↓
insert immutable Revision + Widget snapshots
        ↓
move Draft pointer
```

If the conditional update affects zero rows, Infrastructure returns a semantic conflict, Application raises `RevisionConflictError`, HTTP maps it to RFC 9457 `412`, and the Web adapter maps it to its framework-independent `RevisionConflictError`. Zustand keeps the local dirty Draft and old concurrency token until the user explicitly chooses a server reload.

Publish conditionally points Published at the expected current Draft and creates no Revision. Restore clones a selected historical snapshot into a new Draft Revision with parent and restore provenance; Published remains unchanged. History is newest-first cursor pagination and detail reads a full snapshot directly—no event replay.

PostgreSQL update-prevention triggers enforce Revision and revision-Widget immutability. All history is retained in Phase 3; there is no pruning, delta compression, event sourcing, CRDT, OT, or automatic merge.

## Phase 4 revision/projection separation

Dashboard revisions contain only user decisions:

```text
Dashboard Revision (source of truth)
├── responsive layout
└── Widget snapshot
    ├── stable Widget identity
    ├── type + schemaVersion
    ├── dataConfig + presentationConfig
    └── enabled

Widget Projection (derived, replaceable)
├── widget_id + projection_key
├── data + schema version
├── source_snapshot_id
├── projection_version_id
└── generated/last-success timestamps
```

`projection_key` is SHA-256 over canonical `{type, schemaVersion, dataConfig}`. `presentationConfig` remains in the immutable Revision but does not partition derived data. The stable Widget ID and projection key form the identity, so a Published 7-day configuration and Draft 30-day configuration can coexist without contaminating each other. Projection rows are replaceable Last Known Good values; Revision rows remain immutable history.

The owner Draft endpoint is an editable configuration resource and contains no live data. Its strong `"rev:<uuid>"` ETag remains a valid `If-Match` concurrency token. `GET /v1/me/dashboards/about/data` returns current-Draft live data with a `"data:<hash>"` validator. The public endpoint remains one aggregate read model, but its `"view:<hash>"` ETag incorporates Published Revision, selected projection versions, and effective stale state.

```text
Published Revision ───────────┐
                             ├→ DashboardReadService → public read model
Latest matching Projections ─┘

Draft Revision ──────────────┐
                             ├→ owner live-data resource
Latest matching Projections ─┘
```

Provider synchronization never creates a Dashboard Revision, moves either pointer, or changes a Revision ETag.

## Phase 4 synchronization runtime

```text
API request
  ↓ SyncService
create/reuse active SyncRun + enqueue in one transaction
  ↓ SyncJobQueue port
pg-boss durable PostgreSQL job
  ↓ separate apps/worker process
ProviderRuntimeRegistry
  ↓
Connector → sanitized immutable Raw Snapshot → Normalizer → Projector
  ↓
atomic projection/state/SyncRun commit
```

The public `jobId` is the Nivalis SyncRun UUID. The pg-boss job UUID remains infrastructure metadata. A partial unique index permits only one active run per Provider connection in `queued`, `running`, or `retry_wait`, so repeated UI clicks reuse the active resource.

The Worker assumes at-least-once delivery. Raw insertion is idempotent per `(sync_run_id, payload_hash)`, current projections upsert by `(widget_id, projection_key)`, terminal runs ignore duplicate delivery, and stale running leases can be reclaimed after pg-boss job expiry. Queue retry is bounded exponential backoff with heartbeat-based crash recovery. Retryable Provider failures are distinct from permanent, normalization, projection, and sanitization failures.

All projections are built before one transaction updates the projection set, Provider state, and SyncRun. Fetch/normalization/projection failure never deletes prior successful values. A successfully fetched Raw Snapshot remains available when later normalization or projection fails. Credential-like keys are rejected recursively before Raw Snapshot persistence.

Phase 4 introduced `FixtureProviderRuntime` in development/test. It remains available for pipeline tests and is rejected by production configuration.

### Sync invariants

- `SYNC-001`: Sync never creates Dashboard Revisions.
- `SYNC-002`: Sync never moves Draft or Published pointers.
- `SYNC-003`: Sync never changes owner Revision ETags.
- `SYNC-004`: failure preserves Last Known Good Projection.
- `SYNC-005`: Raw Snapshots contain no credentials and cannot be updated.
- `SYNC-006`: projections are rebuildable derived state.
- `SYNC-007`: Application imports neither pg-boss nor Kysely.

## Phase 5 Owner Auth and credential boundary

Authentication belongs to the Nivalis API, not Next.js:

```text
Browser
  ↓ GitHub OAuth authorization code + PKCE + state
Fastify Auth routes
  ↓ stable external numeric subject
Actor (owner/viewer)
  ↓ opaque Nivalis Session cookie
SHA-256 session-token hash in PostgreSQL
```

OAuth state is single-use and expiring. Its PKCE verifier is AEAD-protected while at rest. The GitHub access token exists only inside the OAuth adapter long enough to call `/user`; it is neither a Nivalis session token nor persisted. The configured `OWNER_GITHUB_USER_ID` determines the one Owner without hard-coding a username. A central pre-handler maps all `/v1/me/*` calls to `OwnerContext { actorId }`: missing sessions return `401`, authenticated viewers return `403`, and unsafe cookie-authenticated requests require an allowed Origin.

Browser sessions are opaque, HttpOnly, SameSite cookies (`Secure` in production). `auth_sessions` stores only a token hash and expiry/revocation metadata. Authentication fixtures exist only in development/test and production rejects them.

Provider credentials cross a write-only HTTP boundary:

```text
Settings
  ↓ generated API client (MUSIC_U value; never read back)
ProviderConnectionService
  ↓ ProviderCredentialStore port + SecretProtector port
AES-256-GCM adapter
  ↓ ciphertext / nonce / auth tag / version / key id
provider_credentials
```

The 32-byte master key comes only from `NIVALIS_CREDENTIAL_MASTER_KEY`. AES-GCM associated data binds ciphertext to owner, connection, purpose, credential type, version, and key ID. Wrong keys, altered context, or tampering fail closed. Pino redacts cookie/authorization/credential paths, and API responses expose status metadata only.

### Interactive NetEase credential acquisition

QR and SMS login reuse the credential boundary without moving Provider I/O into Fastify:

```text
Owner Settings
  ↓ generated API client
ProviderAuthAttempt (public UUID + safe status)
  ↓ ProviderAuthJobQueue port
pg-boss (attempt UUID only)
  ↓ separate Worker
NeteaseAuthClient
  ↓ Set-Cookie parsed in memory
MUSIC_U only
  ↓ existing SecretProtector / CredentialStore / validation Sync
```

`provider_auth_attempts` contains a single active attempt per Owner. QR key, phone, country code, and SMS OTP use a purpose-bound AES-GCM envelope; public state exposes only `qrUrl`, masked phone, TTL, and semantic status. Terminal states erase every envelope column. A short lease prevents concurrent job delivery, while delayed jobs poll QR status without holding a Worker callback open.

Attempt operations are independent from SyncRun and Raw Snapshot. They never create a Dashboard Revision, move a pointer, alter `rev:` ETags, or store login responses as replayable data. Manual credential writes are rejected while an attempt is active, and an Owner can cancel a non-verifying attempt before switching methods. Password and replayable MD5-password login are intentionally absent. See ADR 0014.

Disconnect is a lifecycle barrier: it invalidates all active attempts, clears their encrypted state, deletes the credential, disables the connection, and updates the connection timestamp. Auth completion locks that connection row and rejects any attempt older than the latest disable. A Sync worker also rechecks `connection.enabled` inside its final Projection transaction, preventing in-flight fetches from committing after disconnect. Historical Native/Projection data remains by design, but read models mark it stale and suppress the former account identity.

## Phase 5 NetEase Provider module

All transport behavior is isolated under `packages/connectors/src/netease`:

```text
NeteaseProviderRuntime
├── NeteaseClient        endpoint/protocol/timeout/error mapping
├── NeteaseConnector     sequential read-only sync + payload sanitization
├── NeteaseNormalizer    TypeBox runtime schemas → native semantics
└── NeteaseProjector     Widget v2 availability/provenance/coverage
```

The module implements only account validation, user-detail listen totals, weekly listening records, recent songs, and a weekly listening report. Provider request concurrency is one per connection. There are no Provider writes, passwords, IP spoofing, proxy pools, region bypasses, or runtime community-API service dependencies.

One SyncRun may insert five immutable `provider_raw_snapshots`, each identified by `source_kind`. The Connector recursively strips credential-bearing keys before returning a payload; the Worker independently rejects credential-like Raw input. Runtime schemas intentionally permit harmless extra Provider fields but require every semantic field consumed by normalization. A missing/renamed field raises `ProviderSchemaMismatchError`; it is never coerced to zero, null, or an empty list.

### NetEase native and derived data

```text
sanitized Raw Snapshots (immutable evidence)
  ↓ NeteaseNormalizer
netease_accounts
netease_tracks ↔ netease_artists
netease_recent_listens
netease_track_play_snapshots
netease_metric_snapshots
  ↓ NeteaseProjector
widget_projections (replaceable Last Known Good)
```

Provider IDs are scoped unique keys, not database primary keys. Recent-listen rows exist only when the Provider supplied `playTime`; Nivalis never fabricates a historical timestamp. Provider-reported totals/duration and Nivalis-derived ranked aggregates are explicitly distinguished with `provenance` and `coverage`. NetEase Widget schema v2 models full, partial, valid-empty, stale, and unavailable states and does not invent genres or statistics.

Raw insertion precedes normalization so schema drift remains replayable evidence. Native persistence, projection replacement, credential/sync state, and terminal SyncRun completion share the successful transaction. Any later failure retains the previous Projection. Credential errors do not retry and mark the connection as requiring attention; transient network/429/5xx failures retain bounded Phase 4 retry/backoff.

### Replay

`ProviderReplayService` reads all sanitized snapshots for the selected SyncRun, runs current normalization/projection, and computes a projection diff. Dry-run is the default. Explicit development `--commit` persists Native/Projection changes atomically without changing SyncRun history, Dashboard Revisions, pointers, or `rev:` ETags. The CLI refuses commits in production.

Sanitized NetEase HTTP fixtures cover normal, empty, partial, credential-expired, schema-drift, missing-field, unknown-enum, and large-payload behavior. They are disabled by default and rejected in production. A real Provider contract test is separately secret-gated and absent from normal CI.

### Health and errors

- `/health` checks only process liveness.
- `/ready` checks only the configured persistence adapter (PostgreSQL or D1).
- Every error uses RFC 9457 `application/problem+json` with deployment-neutral `urn:nivalis:problem:*` identifiers and a request ID.
- Fastify/Pino logs are structured and redact authorization/cookie headers.

## Package boundaries

- `apps/web`: rendering, interaction, layout editing, appearance consumption.
- `apps/api`: Fastify composition/transport plus PostgreSQL infrastructure adapters; no Provider code belongs in routes.
- `apps/worker`: independent pg-boss consumer and Provider runtime composition; no HTTP routes.
- `packages/domain`: provider-neutral business concepts.
- `packages/application`: Dashboard use cases, validation, repository and transaction ports; depends only on Domain.
- `packages/connectors`: replaceable Provider adapters; Fixture plus the self-contained read-only NetEase runtime/native adapter.
- `packages/storage`: provider-neutral object storage port.
- `packages/api-client`: deterministic client and types generated from OpenAPI; the Web's sole backend dependency.
- `openapi`: authoritative HTTP contract.

### Cloudflare D1 vertical slice

The optional Cloudflare adapter preserves the same contract boundary:

```text
Pages → generated API client → same-origin /api
                                      ↓
                           Pages Function proxy
                                      ↓ service binding
                              Fetch API Worker
                                      ↓
                             DashboardReadService
                                      ↓
                       D1 Reader / Projection Hydrator

SyncJobQueue / ProviderAuthJobQueue Ports
                    ↓
             Cloudflare Queue
                    ↓
              Consumer Worker
                    ↓
     Netease Connector → Raw → Projection
```

D1 uses separate SQLite migrations and never replaces the PostgreSQL adapter in Domain/Application code. The current slices expose the public Published Dashboard, GitHub OAuth/D1 Session, Owner reads, encrypted NetEase connection management, QR/SMS AuthAttempts, Queue-backed SyncRuns, sanitized Raw Snapshots, and Last Known Good projections. Provider messages carry only Nivalis UUIDs; credentials and private authentication state remain contextual AEAD ciphertext in D1. Immutable Revision write/CAS operations, full NetEase native history, and replay commit remain unported. See ADR 0016.

The public homepage is content-only: anonymous visitors receive no mode switcher, editing chrome, status/sync/API controls, Settings link, phase badge, or operational footer. Direct `/settings` access owns the authentication entry point. Once the API reports an authenticated Owner session, the same `DashboardCanvas` reveals the existing control surface without introducing a second renderer.

The Pages Function removes the `/api` prefix and forwards the request through a Worker Service Binding. OAuth callback responses therefore set a first-party Pages cookie; the browser never depends on a third-party Worker-domain cookie.

The API production artifact bundles Nivalis Domain/Application code while leaving third-party Node dependencies external. This is a packaging boundary only; it does not collapse the source-layer dependency direction. See ADR 0005.

## Layout lifecycle

```text
Published Revision pointer → display mode

Draft Revision pointer → local edit → save with If-Match → new immutable Revision
         ↑                                              ↓
historical Revision → Restore clone ────────────────────┘

explicit Publish + If-Match → move Published pointer to current Draft
```

Layouts are stored per `lg`, `md`, and `sm` breakpoint as `x/y/w/h` data. Smart defaults place new modules; a drag or resize marks the current breakpoint as manually overridden.

Mock Mode keeps a deliberately simple token and LocalStorage lifecycle. API Mode treats PostgreSQL as the durable revision source and retains LocalStorage as a last-known/local-edit safety net. HTTP ETags are encapsulated by `NivalisApiDashboardSource`; `DashboardCanvas` never sees them.

TanStack Query polls SyncRun resources and refreshes only projection/status queries on completion. Zustand merges runtime data into matching Widget configurations without changing local layout, dirty state, or concurrency token; synchronization never reloads the page.

## Storage boundary

Business code depends on `ObjectStorage`, which deals in logical object keys. A later infrastructure package can implement an S3-compatible adapter for any compatible service. Provider-specific URLs and deployment instance identifiers are forbidden in business source.
