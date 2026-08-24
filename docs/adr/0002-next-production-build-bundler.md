# ADR 0002: Use supported Next.js build fallbacks in the managed environment

- Status: Accepted
- Date: 2026-08-23

## Context

Next.js 16.3 defaults `next build` to Turbopack. In the managed validation environment, Turbopack's PostCSS evaluator attempts to bind an internal process port and is rejected with `Operation not permitted`, including when the build command itself runs outside the filesystem sandbox.

During Phase 2 validation, Next.js 16.3.2's default TypeScript CLI checker also emitted output that its own `--showConfig` parser could not consume in this environment. The same project configuration passes the repository's explicit `tsc --noEmit` gate, and Next.js documents the JavaScript compiler API as its supported alternate checker.

## Decision

Use Next.js 16.3's supported `next build --webpack` production-build option and set `experimental.useTypeScriptCli` to `false` so `next build` uses the JavaScript compiler API. Keep the independent `pnpm typecheck` gate mandatory. Development remains `next dev`, and no application or architecture boundary changes.

## Alternatives

- Mark the build as environment-blocked: rejected because Next.js exposes a supported production bundler fallback.
- Remove Tailwind/PostCSS: rejected because it would violate the specified frontend stack and design-token implementation.
- Disable TypeScript checking in `next build`: rejected because the supported compiler API path works and preserves build-time validation.

## Consequences

- Production validation can complete in restricted CI/agent environments.
- Turbopack build parity should be rechecked when the hosting/CI environment permits its internal evaluator process.
- The TypeScript CLI checker should be re-evaluated on a future Next.js upgrade; the explicit repository typecheck remains the primary deterministic gate.
