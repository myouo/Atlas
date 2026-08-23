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

## Package boundaries

- `apps/web`: rendering, interaction, layout editing, appearance consumption.
- `apps/api`: Phase 2 Fastify transport boundary; no Provider code belongs in routes.
- `apps/worker`: Phase 4 asynchronous synchronization process.
- `packages/domain`: provider-neutral business concepts.
- `packages/application`: use cases and ports, depending on Domain.
- `packages/connectors`: replaceable Provider adapters; currently only documented placeholders.
- `packages/storage`: provider-neutral object storage port.
- `packages/api-client`: client and types generated from OpenAPI; the Web's sole backend dependency.
- `openapi`: authoritative HTTP contract.

## Layout lifecycle

```text
Published snapshot → display mode
          ↓ clone
Draft snapshot → edit → save draft → explicit publish
          ↑                         ↓
          └──────── reset ──────────┘
```

Layouts are stored per `lg`, `md`, and `sm` breakpoint as `x/y/w/h` data. Smart defaults place new modules; a drag or resize marks the current breakpoint as manually overridden.

## Storage boundary

Business code depends on `ObjectStorage`, which deals in logical object keys. A later infrastructure package can implement an S3-compatible adapter for any compatible service. Provider-specific URLs and deployment instance identifiers are forbidden in business source.
