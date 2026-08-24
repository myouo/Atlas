import { DashboardReadService } from "@nivalis/application";
import type { DashboardReadModelSnapshot, Profile, WidgetProjection } from "@nivalis/domain";

import { consumeSyncMessages } from "./cloudflare-sync-queue";
import type { CloudflareSyncMessage } from "./cloudflare-sync-queue";
import {
  D1DashboardConfigurationReader,
  D1WidgetProjectionHydrator
} from "./d1-dashboard-read-adapter";
import { PortableViewVersionFactory } from "./portable-version-factory";

export interface Environment {
  readonly CORS_ORIGINS?: string;
  readonly DB: D1Database;
  readonly ENVIRONMENT?: string;
  readonly SYNC_QUEUE: Queue<CloudflareSyncMessage>;
}

const worker = {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const requestUrl = new URL(request.url);
    const requestId = crypto.randomUUID();
    const corsHeaders = resolveCorsHeaders(request, environment.CORS_ORIGINS);

    if (request.method === "OPTIONS") {
      return corsHeaders
        ? new Response(null, { headers: corsHeaders, status: 204 })
        : problem(403, "origin-not-allowed", "Origin not allowed", requestUrl.pathname, requestId);
    }

    if (requestUrl.pathname === "/health" && request.method === "GET") {
      return json({ requestId, status: "ok" }, 200, corsHeaders);
    }

    if (requestUrl.pathname === "/ready" && request.method === "GET") {
      try {
        await environment.DB.prepare("SELECT 1 AS reachable").first();
        return json({ database: "reachable", requestId, status: "ready" }, 200, corsHeaders);
      } catch {
        return problem(
          503,
          "database-unavailable",
          "D1 is not reachable",
          requestUrl.pathname,
          requestId,
          corsHeaders
        );
      }
    }

    try {
      const service = createDashboardReadService(environment.DB);
      if (requestUrl.pathname === "/v1/public/profile" && request.method === "GET") {
        const dashboard = await service.getPublishedDashboard();
        return json(serializeProfile(dashboard.profile), 200, corsHeaders, {
          "Cache-Control": "public, max-age=60"
        });
      }

      if (requestUrl.pathname === "/v1/public/dashboards/about" && request.method === "GET") {
        const dashboard = await service.getPublishedDashboard();
        return json(serializePublicDashboard(dashboard), 200, corsHeaders, {
          "Cache-Control": "public, max-age=60",
          ETag: `"view:${dashboard.viewVersion}"`
        });
      }

      if (requestUrl.pathname === "/v1/auth/session" && request.method === "GET") {
        return json(
          { actorId: null, authenticated: false, expiresAt: null, role: null },
          200,
          corsHeaders
        );
      }

      if (requestUrl.pathname === "/v1/auth/github/start" && request.method === "POST") {
        return problem(
          503,
          "cloudflare-owner-auth-not-configured",
          "Owner authentication is not configured for the D1 adapter",
          requestUrl.pathname,
          requestId,
          corsHeaders
        );
      }

      if (requestUrl.pathname.startsWith("/v1/")) {
        return problem(
          501,
          "cloudflare-adapter-not-implemented",
          "This OpenAPI capability has not been ported to the D1 adapter",
          requestUrl.pathname,
          requestId,
          corsHeaders
        );
      }

      return problem(
        404,
        "route-not-found",
        "Route not found",
        requestUrl.pathname,
        requestId,
        corsHeaders
      );
    } catch {
      return problem(
        500,
        "d1-read-model-failed",
        "The D1 Dashboard read model could not be loaded",
        requestUrl.pathname,
        requestId,
        corsHeaders
      );
    }
  },

  async queue(batch: MessageBatch<CloudflareSyncMessage>, environment: Environment) {
    await consumeSyncMessages(batch, environment.DB);
  }
} satisfies ExportedHandler<Environment, CloudflareSyncMessage>;

export default worker;

function createDashboardReadService(database: D1Database) {
  return new DashboardReadService(
    new D1DashboardConfigurationReader(database),
    new D1WidgetProjectionHydrator(database),
    new PortableViewVersionFactory()
  );
}

function serializeProfile(profile: Profile) {
  return { ...profile, tags: [...profile.tags] };
}

function serializePublicDashboard(dashboard: DashboardReadModelSnapshot) {
  return {
    dashboardId: dashboard.dashboardId,
    layout: {
      lg: dashboard.layout.lg.map((item) => ({ ...item })),
      md: dashboard.layout.md.map((item) => ({ ...item })),
      sm: dashboard.layout.sm.map((item) => ({ ...item }))
    },
    profile: serializeProfile(dashboard.profile),
    revision: dashboard.revision,
    widgets: dashboard.widgets.map(serializeWidgetProjection)
  };
}

function serializeWidgetProjection(widget: WidgetProjection) {
  return {
    data: widget.data,
    dataConfig: widget.dataConfig,
    enabled: widget.enabled,
    id: widget.id,
    presentationConfig: widget.presentationConfig,
    provider: widget.provider,
    schemaVersion: widget.schemaVersion,
    stale: widget.stale,
    title: widget.title,
    type: widget.type,
    updatedAt: widget.updatedAt.toISOString()
  };
}

function resolveCorsHeaders(request: Request, configuredOrigins?: string) {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;

  const allowed = new Set(
    (configuredOrigins ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  if (!allowed.has(origin)) return undefined;

  return new Headers({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, If-Match",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  });
}

function json(
  body: unknown,
  status: number,
  corsHeaders?: Headers,
  additionalHeaders?: Readonly<Record<string, string>>
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...additionalHeaders
  });
  applyCorsHeaders(headers, corsHeaders);
  return new Response(JSON.stringify(body), { headers, status });
}

function problem(
  status: number,
  code: string,
  title: string,
  instance: string,
  requestId: string,
  corsHeaders?: Headers
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/problem+json; charset=utf-8"
  });
  applyCorsHeaders(headers, corsHeaders);
  return new Response(
    JSON.stringify({
      instance,
      requestId,
      status,
      title,
      type: `urn:nivalis:problem:${code}`
    }),
    { headers, status }
  );
}

function applyCorsHeaders(target: Headers, corsHeaders?: Headers) {
  corsHeaders?.forEach((value, key) => target.set(key, value));
}
