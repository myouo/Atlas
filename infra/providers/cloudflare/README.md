# Optional Cloudflare deployment adapters

Cloudflare remains an infrastructure provider, not a business dependency. No Account ID, Zone ID, deployment hostname, database endpoint, or credential is committed here.

## Pages preview

The current Pages target is an explicit static Next.js export in Mock Mode. It is intended for public visual and interaction QA while keeping Browser-only fixtures honest.

```bash
CLOUDFLARE_PAGES_PROJECT=<project> pnpm deploy:pages
```

The build output is `apps/web/out`. `NEXT_PUBLIC_DASHBOARD_SOURCE=mock` is forced by the preview build command, so Provider authentication is unavailable and cannot be mistaken for a real connection.

## Edge gateway Worker

`edge/` contains a Fetch-native infrastructure gateway:

```bash
pnpm preview:edge
pnpm deploy:edge
```

- `/health` reports only the Edge process status.
- Without `UPSTREAM_API_BASE_URL`, `/ready` and `/v1/*` return an RFC 9457-style `503` instead of fake data.
- If a separately deployed Node API origin is configured, the gateway forwards only `/ready` and `/v1/*`.
- CORS has no wildcard fallback; allowed origins come from `CORS_ORIGINS`.

The current Fastify + PostgreSQL + pg-boss processes are not silently converted to edge state. A full Cloudflare runtime requires a reachable PostgreSQL deployment and an explicit queue/runtime adapter decision.
