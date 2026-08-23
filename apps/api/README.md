# API application

Phase 1 commits the API contract but intentionally does not run an HTTP server. Phase 2 will add Fastify transport, Application use cases, Kysely repositories, and RFC 9457 error mapping here.

Routes may parse/validate HTTP and invoke use cases. They must never fetch a Provider or contain cross-platform aggregation rules.
