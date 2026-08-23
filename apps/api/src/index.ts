/**
 * Phase 2 transport entrypoint.
 *
 * Fastify is intentionally not bootstrapped in Phase 1. The HTTP contract is
 * already committed under /openapi so transport work cannot redefine it later.
 */
export const apiPhase = "contract-only" as const;
