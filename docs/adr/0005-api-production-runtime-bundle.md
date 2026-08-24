# ADR 0005: Bundle the API production runtime after strict type checking

- Status: Accepted
- Date: 2026-08-23

## Context

The Monorepo uses TypeScript `moduleResolution: Bundler` for its replaceable frontend and workspace development flow. Plain `tsc` output preserves extensionless ESM imports and workspace package specifiers whose development exports point to TypeScript source. Node.js cannot execute that emitted API graph directly, even though compilation succeeds.

Phase 2 needs `pnpm --filter @nivalis/api start` and the compiled database CLI to execute independently of `tsx` development loaders.

## Decision

Run the API's strict `tsc --noEmit` gate, then use esbuild to create Node 24 ESM bundles for `start.ts` and `cli/database.ts`.

- Bundle Nivalis Domain and Application workspace code into the API runtime artifact.
- Keep Fastify, Kysely, PostgreSQL, TypeBox, Pino, dotenv, and other third-party runtime dependencies external.
- Emit source maps and clean only the explicit `apps/api/dist` build directory.
- Keep `tsx watch` for source-oriented local development.

## Alternatives

- Run TypeScript source through `tsx` in production: rejected because the production start command would not exercise the build artifact.
- Convert every package and relative import to NodeNext `.js` specifiers and make development depend on prebuilt workspace packages: rejected because it would degrade the current independent source-development loop across Web and API.
- Bundle every third-party dependency: rejected because native/dynamic Node dependencies such as the PostgreSQL driver are safer as normal runtime packages.

## Consequences

- Production API and database CLI artifacts run directly with Node.js after `pnpm build`.
- Type safety remains a separate blocking gate rather than being delegated to the bundler.
- Deployment packaging must include API third-party production dependencies and the committed `migrations/` directory.
