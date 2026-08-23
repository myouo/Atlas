# Nivalis About Me

Nivalis is a personal digital identity, multi-provider data aggregation, and composable Dashboard system. Phase 1 validates the Web rendering architecture with explicit mock data; it does not call any third-party provider.

## Architecture at a glance

```text
Provider → Connector → Worker → PostgreSQL → Nivalis API → generated API client → Web
```

The Web owns presentation and interaction only. `type + schemaVersion` selects a renderer through the Widget Registry, every widget is wrapped by the same `ModuleShell`, and display/edit modes share one `DashboardCanvas`.

Read [the implementation specification](docs/NIVALIS_ABOUTME_IMPLEMENTATION_SPEC.md) and [architecture guide](docs/ARCHITECTURE.md) before changing boundaries. Phase 1 visual evidence is recorded in [Design QA](design-qa.md), and generated image prompts are preserved in [Asset Generation](docs/ASSET_GENERATION.md).

## Prerequisites

- Node.js 24 LTS
- pnpm 11+

## Local setup

```bash
pnpm install
pnpm generate
pnpm dev
```

Copy `.env.example` to an untracked local environment file only when a later phase needs runtime configuration. Phase 1 works without credentials.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Playwright coverage is configured separately with `pnpm test:e2e`.

## Phase status

- Phase 1: Dashboard renderer, mock projections, responsive edit experience, local draft/published layout persistence.
- Phase 2+: API implementation, PostgreSQL repositories, revisions, Worker, and real Connector adapters remain intentionally unimplemented. See [TODO](docs/TODO.md).

## Security

Assume this repository is public. Never commit credentials, provider cookies, tokens, deployment instance identifiers, real domains, or object-storage secrets. The committed `.env.example` contains keys only.
