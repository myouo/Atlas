import { DashboardReadService } from "@nivalis/application";
import type {
  DashboardLiveDataSnapshot,
  DashboardReadModelSnapshot,
  DashboardSnapshot,
  Profile,
  ProviderAuthAttempt,
  ProviderConnectionView,
  ProviderStatus,
  SyncRun,
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
import { createCloudflareProviderRuntime } from "./cloudflare-provider-runtime";
import type { ProviderEnvironment } from "./cloudflare-provider-runtime";
import { consumeQueueMessages } from "./cloudflare-sync-queue";
import type { CloudflareQueueMessage } from "./cloudflare-sync-queue";
import { parseDashboardDraft } from "./dashboard-http-input";
import {
  D1DashboardConfigurationReader,
  D1WidgetProjectionHydrator
} from "./d1-dashboard-read-adapter";
import { D1DashboardWriteService } from "./d1-dashboard-write-service";
import { PortableViewVersionFactory } from "./portable-version-factory";

export interface Environment extends AuthEnvironment, ProviderEnvironment {
  readonly CORS_ORIGINS?: string;
  readonly DB: D1Database;
  readonly ENVIRONMENT?: string;
  readonly SYNC_QUEUE: Queue<CloudflareQueueMessage>;
}

const worker = {
  async fetch(
    request: Request,
    environment: Environment,
    executionContext: ExecutionContext
  ): Promise<Response> {
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
          "Cache-Control": "public, max-age=60, no-transform",
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

        if (requestUrl.pathname === "/v1/me/dashboards/about/draft" && request.method === "PUT") {
          const expectedRevisionId = parseRequiredRevisionEtag(request.headers.get("if-match"));
          const input = parseDashboardDraft(await readObjectBody(request));
          const saved = await new D1DashboardWriteService(environment.DB).saveDraft(
            session.actor.id,
            expectedRevisionId,
            input
          );
          return json(serializeDashboardState(saved), 200, corsHeaders, {
            ETag: `"rev:${saved.revisionId}"`
          });
        }

        if (
          requestUrl.pathname === "/v1/me/dashboards/about/publish" &&
          request.method === "POST"
        ) {
          const expectedRevisionId = parseRequiredRevisionEtag(request.headers.get("if-match"));
          const published = await new D1DashboardWriteService(environment.DB).publish(
            session.actor.id,
            expectedRevisionId
          );
          return json(serializeDashboardState(published), 200, corsHeaders, {
            ETag: `"rev:${published.revisionId}"`
          });
        }

        if (requestUrl.pathname === "/v1/me/dashboards/about/data" && request.method === "GET") {
          const live = await service.getDraftLiveData({ actorId: session.actor.id });
          return json(serializeLiveData(live), 200, corsHeaders, {
            ETag: `"data:${live.dataVersion}"`
          });
        }

        if (
          requestUrl.pathname.startsWith("/v1/me/providers") ||
          requestUrl.pathname.startsWith("/v1/me/sync-jobs")
        ) {
          const providers = createCloudflareProviderRuntime(
            environment.DB,
            environment.SYNC_QUEUE,
            environment
          );
          if (!providers) {
            return problem(
              503,
              "provider-security-not-configured",
              "Provider credential encryption is not configured",
              requestUrl.pathname,
              requestId,
              corsHeaders
            );
          }
          const context = { actorId: session.actor.id };

          if (requestUrl.pathname === "/v1/me/providers/status" && request.method === "GET") {
            return json(
              {
                providers: (await providers.sync.listProviderStatuses(session.actor.id)).map(
                  serializeProviderStatus
                )
              },
              200,
              corsHeaders
            );
          }

          if (requestUrl.pathname === "/v1/me/providers" && request.method === "GET") {
            return json(
              {
                providers: (await providers.connections.list(context)).map(
                  serializeProviderConnection
                )
              },
              200,
              corsHeaders
            );
          }

          if (requestUrl.pathname === "/v1/me/providers/netease/data" && request.method === "GET") {
            const catalog = await providers.sync.getOwnerDataCatalog(session.actor.id);
            if (!catalog) {
              return problem(
                404,
                "provider-data-not-found",
                "NetEase data has not been synchronized yet",
                requestUrl.pathname,
                requestId,
                corsHeaders
              );
            }
            return json(
              {
                ...catalog,
                generatedAt: catalog.generatedAt.toISOString()
              },
              200,
              corsHeaders,
              { ETag: `"catalog:${catalog.dataVersion}"` }
            );
          }

          if (requestUrl.pathname === "/v1/me/providers/netease" && request.method === "GET") {
            return json(
              serializeProviderConnection(await providers.connections.getNetease(context)),
              200,
              corsHeaders
            );
          }

          if (
            requestUrl.pathname === "/v1/me/providers/netease/connect" &&
            request.method === "POST"
          ) {
            const body = await readObjectBody(request);
            const credential = requiredString(body, "credential");
            if (body.credentialType !== "music_u") throw new InvalidRequestError();
            await providers.auth.assertNoActive(context);
            const accepted = await providers.connections.connectNetease(
              context,
              "music_u",
              credential
            );
            return json(
              {
                connection: serializeProviderConnection(accepted.connection),
                validationJob: serializeSyncJob(accepted.validationJob)
              },
              202,
              corsHeaders,
              { Location: `/v1/me/sync-jobs/${accepted.validationJob.id}` }
            );
          }

          if (
            requestUrl.pathname === "/v1/me/providers/netease/auth-attempts/qr" &&
            request.method === "POST"
          ) {
            const attempt = await providers.auth.startQr(context);
            executionContext.waitUntil(progressProviderAuthentication(providers, attempt.id));
            return json(serializeProviderAuthAttempt(attempt), 202, corsHeaders, {
              Location: `/v1/me/providers/netease/auth-attempts/${attempt.id}`
            });
          }

          if (
            requestUrl.pathname === "/v1/me/providers/netease/auth-attempts/sms" &&
            request.method === "POST"
          ) {
            const body = await readObjectBody(request);
            const attempt = await providers.auth.startSms(
              context,
              requiredString(body, "phone"),
              requiredString(body, "countryCode")
            );
            executionContext.waitUntil(progressProviderAuthentication(providers, attempt.id));
            return json(serializeProviderAuthAttempt(attempt), 202, corsHeaders, {
              Location: `/v1/me/providers/netease/auth-attempts/${attempt.id}`
            });
          }

          const verifyAttemptId = pathParameter(
            requestUrl.pathname,
            /^\/v1\/me\/providers\/netease\/auth-attempts\/([^/]+)\/verify$/
          );
          if (verifyAttemptId && request.method === "POST") {
            const body = await readObjectBody(request);
            const attempt = await providers.auth.verifySms(
              context,
              verifyAttemptId,
              requiredString(body, "code")
            );
            executionContext.waitUntil(progressProviderAuthentication(providers, attempt.id));
            return json(serializeProviderAuthAttempt(attempt), 202, corsHeaders);
          }

          const authAttemptId = pathParameter(
            requestUrl.pathname,
            /^\/v1\/me\/providers\/netease\/auth-attempts\/([^/]+)$/
          );
          if (authAttemptId && request.method === "GET") {
            const attempt = await providers.auth.get(context, authAttemptId);
            if (attempt.status === "queued" && attempt.lastErrorCode === null) {
              executionContext.waitUntil(progressProviderAuthentication(providers, attempt.id));
            }
            return json(serializeProviderAuthAttempt(attempt), 200, corsHeaders);
          }
          if (authAttemptId && request.method === "DELETE") {
            await providers.auth.cancel(context, authAttemptId);
            return empty(204, corsHeaders);
          }

          if (
            requestUrl.pathname === "/v1/me/providers/netease/connection" &&
            request.method === "DELETE"
          ) {
            await providers.auth.cancelAll(context);
            await providers.connections.disconnectNetease(context);
            return empty(204, corsHeaders);
          }

          const syncProvider = pathParameter(
            requestUrl.pathname,
            /^\/v1\/me\/providers\/([^/]+)\/sync$/
          );
          if (syncProvider && request.method === "POST") {
            if (syncProvider !== "netease") {
              return problem(
                503,
                "provider-not-configured",
                "Provider synchronization is not configured",
                requestUrl.pathname,
                requestId,
                corsHeaders
              );
            }
            const run = await providers.sync.enqueue(session.actor.id);
            return json(serializeSyncJob(run), 202, corsHeaders, {
              Location: `/v1/me/sync-jobs/${run.id}`
            });
          }

          const syncRunId = pathParameter(requestUrl.pathname, /^\/v1\/me\/sync-jobs\/([^/]+)$/);
          if (syncRunId && request.method === "GET") {
            const run = await providers.sync.getForOwner(session.actor.id, syncRunId);
            if (!run) {
              return problem(
                404,
                "sync-run-not-found",
                "SyncRun not found",
                requestUrl.pathname,
                requestId,
                corsHeaders
              );
            }
            return json(serializeSyncJob(run), 200, corsHeaders);
          }
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
    } catch (error) {
      return mapProblem(error, requestUrl.pathname, requestId, corsHeaders);
    }
  },

  async queue(batch: MessageBatch<CloudflareQueueMessage>, environment: Environment) {
    const providers = createCloudflareProviderRuntime(
      environment.DB,
      environment.SYNC_QUEUE,
      environment
    );
    if (!providers) {
      for (const message of batch.messages) message.retry({ delaySeconds: 300 });
      return;
    }
    await consumeQueueMessages(batch, environment.DB, {
      providerAuth: async (attemptId) => {
        await providers.authWorker.process(attemptId);
      },
      sync: async (syncRunId) => {
        await providers.sync.process(syncRunId);
      }
    });
  }
} satisfies ExportedHandler<Environment, CloudflareQueueMessage>;

export default worker;

async function progressProviderAuthentication(
  providers: NonNullable<ReturnType<typeof createCloudflareProviderRuntime>>,
  attemptId: string
) {
  try {
    await providers.authWorker.process(attemptId);
  } catch {
    await providers.authQueue.enqueue(attemptId);
  }
}

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

function serializeProviderConnection(connection: ProviderConnectionView) {
  return {
    configured: connection.configured,
    credentialStatus: connection.credentialStatus,
    credentialUpdatedAt: connection.credentialUpdatedAt?.toISOString() ?? null,
    displayName: connection.displayName,
    enabled: connection.enabled,
    lastValidatedAt: connection.lastValidatedAt?.toISOString() ?? null,
    provider: connection.provider,
    providerAccountId: connection.providerAccountId
  };
}

function serializeProviderAuthAttempt(attempt: ProviderAuthAttempt) {
  return {
    attemptId: attempt.id,
    createdAt: attempt.createdAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    lastErrorCode: attempt.lastErrorCode,
    lastErrorMessage: attempt.lastErrorMessage,
    maskedPhone: attempt.maskedPhone,
    method: attempt.method,
    provider: attempt.provider,
    qrUrl: attempt.qrUrl,
    resendAfter: attempt.resendAfter?.toISOString() ?? null,
    status: attempt.status,
    updatedAt: attempt.updatedAt.toISOString()
  };
}

function serializeSyncJob(run: SyncRun) {
  return {
    attemptCount: run.attemptCount,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    jobId: run.id,
    lastErrorCode: run.lastErrorCode,
    lastErrorMessage: run.lastErrorMessage,
    provider: run.provider,
    requestedAt: run.requestedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    status: run.status === "retry_wait" ? "retrying" : run.status
  };
}

function serializeProviderStatus(status: ProviderStatus) {
  return {
    attemptCount: status.attemptCount,
    connection: status.connection,
    credentialStatus: status.credentialStatus,
    lastAttemptAt: status.lastAttemptAt?.toISOString() ?? null,
    lastErrorCode: status.lastErrorCode,
    lastErrorMessage: status.lastErrorMessage,
    lastSuccessAt: status.lastSuccessAt?.toISOString() ?? null,
    provider: status.provider,
    syncStatus: status.syncStatus
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
    "Cache-Control": "no-store, no-transform",
    "Content-Type": "application/json; charset=utf-8",
    ...additionalHeaders
  });
  applyCorsHeaders(headers, corsHeaders);
  return new Response(JSON.stringify(body), { headers, status });
}

function empty(status: number, corsHeaders?: Headers) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  applyCorsHeaders(headers, corsHeaders);
  return new Response(null, { headers, status });
}

function problem(
  status: number,
  code: string,
  title: string,
  instance: string,
  requestId: string,
  corsHeaders?: Headers,
  detail?: string,
  extensions?: Readonly<Record<string, unknown>>
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
      type: `urn:nivalis:problem:${code}`,
      ...(detail ? { detail } : {}),
      ...extensions
    }),
    { headers, status }
  );
}

class InvalidRequestError extends Error {
  readonly code = "invalid-request";

  constructor() {
    super("The request body is invalid.");
    this.name = "InvalidRequestError";
  }
}

class PreconditionRequiredError extends Error {
  readonly code = "precondition-required";

  constructor() {
    super("This operation requires an If-Match revision validator.");
    this.name = "PreconditionRequiredError";
  }
}

async function readObjectBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 65_536) throw new InvalidRequestError();
  const text = await request.text();
  if (text.length > 65_536) throw new InvalidRequestError();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidRequestError();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidRequestError();
  }
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string") throw new InvalidRequestError();
  return value;
}

function parseRequiredRevisionEtag(value: string | null) {
  if (!value) throw new PreconditionRequiredError();
  const match =
    /^"rev:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"$/i.exec(
      value
    );
  if (!match?.[1]) throw new InvalidRequestError();
  return match[1];
}

function pathParameter(pathname: string, pattern: RegExp) {
  const value = pattern.exec(pathname)?.[1];
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    throw new InvalidRequestError();
  }
}

function mapProblem(error: unknown, instance: string, requestId: string, corsHeaders?: Headers) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "internal-error";
  const detail = error instanceof Error ? error.message : undefined;
  switch (code) {
    case "invalid-request":
    case "invalid-provider-credential":
      return problem(400, code, "Invalid request", instance, requestId, corsHeaders, detail);
    case "precondition-required":
      return problem(428, code, "Precondition required", instance, requestId, corsHeaders, detail);
    case "dashboard-not-found":
      return problem(404, code, "Dashboard not found", instance, requestId, corsHeaders, detail);
    case "invalid-dashboard": {
      const issues =
        error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
          ? error.issues.filter((issue): issue is string => typeof issue === "string")
          : [];
      return problem(
        422,
        code,
        "Dashboard state is invalid",
        instance,
        requestId,
        corsHeaders,
        detail,
        {
          issues
        }
      );
    }
    case "revision-conflict": {
      const conflict = error as {
        readonly currentRevisionId: string;
        readonly currentRevisionNumber: number;
      };
      return problem(
        412,
        code,
        "Dashboard revision conflict",
        instance,
        requestId,
        corsHeaders,
        detail,
        {
          currentEtag: `"rev:${conflict.currentRevisionId}"`,
          currentRevisionId: conflict.currentRevisionId,
          currentRevisionNumber: conflict.currentRevisionNumber
        }
      );
    }
    case "provider-auth-attempt-not-found":
      return problem(
        404,
        code,
        "Provider authentication attempt not found",
        instance,
        requestId,
        corsHeaders,
        detail
      );
    case "provider-connection-not-found":
      return problem(
        404,
        code,
        "Provider connection not found",
        instance,
        requestId,
        corsHeaders,
        detail
      );
    case "sync-run-not-found":
      return problem(404, code, "SyncRun not found", instance, requestId, corsHeaders, detail);
    case "provider-auth-attempt-state":
      return problem(
        409,
        code,
        "Provider authentication state conflict",
        instance,
        requestId,
        corsHeaders,
        detail
      );
    case "provider-not-configured":
      return problem(
        503,
        code,
        "Provider is not configured",
        instance,
        requestId,
        corsHeaders,
        detail
      );
    case "retryable-provider-error":
      return problem(
        503,
        code,
        "Provider is temporarily unavailable",
        instance,
        requestId,
        corsHeaders
      );
    default:
      return problem(
        500,
        "internal-error",
        "The request could not be completed",
        instance,
        requestId,
        corsHeaders
      );
  }
}

function applyCorsHeaders(target: Headers, corsHeaders?: Headers) {
  corsHeaders?.forEach((value, key) => target.set(key, value));
}
