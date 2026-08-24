# Compose development infrastructure

`postgres.compose.yml` starts only generic PostgreSQL development infrastructure. It contains no vendor endpoint or deployed instance identifier.

Set untracked local values for `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and optionally `POSTGRES_PORT`, then run:

```bash
docker compose -f infra/compose/postgres.compose.yml up -d
```

Web, API, and Worker remain independent processes. Generic production container packaging is deferred until deployment hardening; it must not change Application or Domain code.
