import { DashboardReadService } from "@nivalis/application";
import type {
  DashboardLiveDataSnapshot,
  DashboardReadModelSnapshot,
  DashboardSnapshot,
  Profile,
  WidgetConfiguration,
  WidgetProjection
} from "@nivalis/domain";

import {
  createAuthRuntime,
  expiredSessionCookie,
  readAuthSession,
  revokeAuthSession,
  sessionCookie
} from "./cloudflare-auth";
import type { AuthEnvironment } from "./cloudflare-auth";
import { consumeSyncMessages } from "./cloudflare-sync-queue";
import type { CloudflareSyncMessage } from "./cloudflare-sync-queue";
import {
  D1DashboardConfigurationReader,
  D1WidgetProjectionHydrator
} from "./d1-dashboard-read-adapter";
import { PortableViewVersionFactory } from "./portable-version-factory";

export interface Environment extends AuthEnvironment {
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

    if (requestUrl.pathname === "/v1/auth/github/start" && request.method === "POST") {
      const auth = createAuthRuntime(environment.DB, environment);
      if (!auth) {
        return problem(
          503,
          "cloudflare-owner-auth-not-configured",
          "Owner authentication is not configured for the D1 adapter",
          requestUrl.pathname,
          requestId,
          corsHeaders
        );
      }
      const started = await auth.service.startGithubAuthentication();
      return json(
        {
          authorizationUrl: started.authorizationUrl,
          expiresAt: started.expiresAt.toISOString()
        },
        200,
        corsHeaders
      );
    }

    if (requestUrl.pathname === "/v1/auth/github/callback" && request.method === "GET") {
      const auth = createAuthRuntime(environment.DB, environment);
      if (!auth) {
        return problem(
          503,
          "cloudflare-owner-auth-not-configured",
          "Owner authentication is not configured for the D1 adapter",
          requestUrl.pathname,
          requestId
        );
      }
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      if (!code || !state || state.length < 32) {
        return problem(
          400,
          "invalid-auth-transaction",
          "GitHub authentication callback is invalid",
          requestUrl.pathname,
          requestId
        );
      }
      try {
        const issued = await auth.service.completeGithubAuthentication(code, state);
        const redirect = new URL("/settings", auth.appOrigin);
        redirect.searchParams.set("auth", "success");
        return new Response(null, {
          headers: {
            Location: redirect.toString(),
            "Set-Cookie": sessionCookie(issued.token, issued.expiresAt)
          },
          status: 302
        });
      } catch (error) {
        const external = error instanceof Error && error.name === "ExternalAuthenticationError";
        return problem(
          external ? 502 : 400,
          external ? "external-authentication-failed" : "invalid-auth-transaction",
          external
            ? "GitHub authentication failed"
            : "GitHub authentication transaction is invalid or expired",
          requestUrl.pathname,
          requestId
        );
      }
    }

    if (requestUrl.pathname === "/v1/auth/session" && request.method === "GET") {
      const session = await readAuthSession(request, environment.DB);
      return json(
        session
          ? {
              actorId: session.actor.id,
              authenticated: true,
              expiresAt: session.expiresAt.toISOString(),
              role: session.actor.role
            }
          : { actorId: null, authenticated: false, expiresAt: null, role: null },
        200,
        corsHeaders
      );
    }

    if (requestUrl.pathname === "/v1/auth/logout" && request.method === "POST") {
      if (!(await revokeAuthSession(request, environment.DB))) {
        return problem(
          401,
          "unauthenticated",
          "Authentication is required",
          requestUrl.pathname,
          requestId,
          corsHeaders
        );
      }
      const headers = new Headers({ "Set-Cookie": expiredSessionCookie() });
      applyCorsHeaders(headers, corsHeaders);
      return new Response(null, { headers, status: 204 });
    }

    try {
      const service = createDashboardReadService(environment.DB);
      const reader = new D1DashboardConfigurationReader(environment.DB);
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

      if (requestUrl.pathname.startsWith("/v1/me/")) {
        const session = await readAuthSession(request, environment.DB);
        if (!session) {
          return problem(
            401,
            "unauthenticated",
            "Authentication is required",
            requestUrl.pathname,
            requestId,
            corsHeaders
          );
        }
        if (session.actor.role !== "owner") {
          return problem(
            403,
            "forbidden",
            "Owner access is required",
            requestUrl.pathname,
            requestId,
            corsHeaders
          );
        }

        if (requestUrl.pathname === "/v1/me/dashboards/about/draft" && request.method === "GET") {
          const draft = await reader.getCurrentForOwner(session.actor.id, "about", "draft");
          if (!draft) {
            return problem(
              404,
              "dashboard-not-found",
              "Dashboard not found",
              requestUrl.pathname,
              requestId,
              corsHeaders
            );
          }
          return json(serializeDashboardState(draft), 200, corsHeaders, {
            ETag: `"rev:${draft.revisionId}"`
          });
        }

        if (requestUrl.pathname === "/v1/me/dashboards/about/data" && request.method === "GET") {
          const live = await service.getDraftLiveData({ actorId: session.actor.id });
          return json(serializeLiveData(live), 200, corsHeaders, {
            ETag: `"data:${live.dataVersion}"`
          });
        }

        if (requestUrl.pathname === "/v1/me/providers/status" && request.method === "GET") {
          return json({ providers: disconnectedProviderStatuses() }, 200, corsHeaders);
        }

        if (requestUrl.pathname === "/v1/me/providers" && request.method === "GET") {
          return json({ providers: [disconnectedNeteaseConnection()] }, 200, corsHeaders);
        }

        if (requestUrl.pathname === "/v1/me/providers/netease" && request.method === "GET") {
          return json(disconnectedNeteaseConnection(), 200, corsHeaders);
        }

        return problem(
          501,
          "cloudflare-adapter-not-implemented",
          "This Owner capability has not been ported to the D1 adapter",
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

function serializeDashboardState(dashboard: DashboardSnapshot) {
  return {
    dashboardId: dashboard.dashboardId,
    layout: {
      lg: dashboard.layout.lg.map((item) => ({ ...item })),
      md: dashboard.layout.md.map((item) => ({ ...item })),
      sm: dashboard.layout.sm.map((item) => ({ ...item }))
    },
    profile: serializeProfile(dashboard.profile),
    revision: dashboard.revision,
    revisionId: dashboard.revisionId,
    state: dashboard.state,
    updatedAt: dashboard.updatedAt.toISOString(),
    widgets: dashboard.widgets.map(serializeWidgetConfiguration)
  };
}

function serializeLiveData(snapshot: DashboardLiveDataSnapshot) {
  return {
    configurationRevisionId: snapshot.configurationRevisionId,
    dashboardId: snapshot.dashboardId,
    generatedAt: snapshot.generatedAt.toISOString(),
    projectionVersions: snapshot.projectionVersions.map((version) => ({
      projectionKey: version.projectionKey,
      projectionVersion: version.projectionVersion,
      widgetId: version.widgetId
    })),
    widgets: snapshot.widgets.map(serializeWidgetProjection)
  };
}

function serializeWidgetConfiguration(widget: WidgetConfiguration) {
  return {
    dataConfig: widget.dataConfig,
    enabled: widget.enabled,
    id: widget.id,
    presentationConfig: widget.presentationConfig,
    provider: widget.provider,
    schemaVersion: widget.schemaVersion,
    title: widget.title,
    type: widget.type
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

function disconnectedNeteaseConnection() {
  return {
    configured: false,
    credentialStatus: "not_configured",
    credentialUpdatedAt: null,
    displayName: null,
    enabled: false,
    lastValidatedAt: null,
    provider: "netease",
    providerAccountId: null
  };
}

function disconnectedProviderStatuses() {
  return ["netease", "github", "bangumi", "steam", "bilibili"].map((provider) => ({
    attemptCount: 0,
    connection: "not_connected",
    credentialStatus: "not_configured",
    lastAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastSuccessAt: null,
    provider,
    syncStatus: "idle"
  }));
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
