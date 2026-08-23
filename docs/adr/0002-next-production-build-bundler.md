# ADR 0002: Use the supported webpack path for the Phase 1 production build

- Status: Accepted
- Date: 2026-08-23

## Context

Next.js 16.3 defaults `next build` to Turbopack. In the managed validation environment, Turbopack's PostCSS evaluator attempts to bind an internal process port and is rejected with `Operation not permitted`, including when the build command itself runs outside the filesystem sandbox.

## Decision

Use Next.js 16.3's supported `next build --webpack` production-build option for deterministic Phase 1 validation. Development remains `next dev`, and no application or architecture boundary changes.

## Alternatives

- Mark the build as environment-blocked: rejected because Next.js exposes a supported production bundler fallback.
- Remove Tailwind/PostCSS: rejected because it would violate the specified frontend stack and design-token implementation.

## Consequences

- Production validation can complete in restricted CI/agent environments.
- Turbopack build parity should be rechecked when the hosting/CI environment permits its internal evaluator process.
