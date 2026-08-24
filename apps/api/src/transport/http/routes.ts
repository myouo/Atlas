import type {
  DashboardReadService,
  DashboardService,
  ProviderAuthService,
  ProviderConnectionService,
  ProviderDataService,
  SyncService
} from "@nivalis/application";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import {
  deserializeDraftUpdate,
  deserializePlacement,
  deserializeWidgetPatch,
  deserializeWidget,
  serializeDashboard,
  serializeLiveData,
  serializeProviderConnection,
  serializeProviderAuthAttempt,
  serializeProviderStatus,
  serializePublicDashboard,
  serializeRevisionDetail,
  serializeRevisionMetadata,
  serializeSyncJob,
  serializeWidgetConfiguration
} from "./mappers";
import { sendProblem } from "./problem-details";
import {
  AppearanceSettingsSchema,
  CreateWidgetInputSchema,
  DashboardDraftUpdateSchema,
  DashboardLiveDataSchema,
  DashboardReadModelSchema,
  DashboardRevisionDetailSchema,
  DashboardRevisionListSchema,
  DashboardStateSchema,
  HealthStatusSchema,
  IfMatchHeadersSchema,
  JobParamsSchema,
  NeteaseConnectInputSchema,
  NeteaseDataCatalogSchema,
  NeteaseSmsAuthInputSchema,
  NeteaseSmsVerifyInputSchema,
  ProblemDetailsSchema,
  ProfileSchema,
  ProviderParamsSchema,
  ProviderConnectAcceptedSchema,
  ProviderAuthAttemptParamsSchema,
  ProviderAuthAttemptSchema,
  ProviderConnectionListSchema,
  ProviderConnectionSchema,
  ProviderStatusListSchema,
  ReadinessStatusSchema,
  RevisionConflictProblemSchema,
  RevisionIdParamsSchema,
  RevisionListQuerySchema,
  SyncJobSchema,
  UpdateWidgetInputSchema,
  WidgetIdParamsSchema,
  WidgetConfigurationSchema
} from "./schemas";
import { requireOwnerContext } from "./auth-boundary";
import {
  encodeRevisionCursor,
  formatCatalogEtag,
  formatDataEtag,
  formatRevisionEtag,
  formatViewEtag,
  parseRequiredRevisionEtag
} from "./revision-etag";

interface RouteOptions {
  readonly dashboardService: DashboardService;
  readonly providerConnectionService: ProviderConnectionService;
  readonly providerDataService: ProviderDataService;
  readonly providerAuthService: ProviderAuthService;
  readonly readService: DashboardReadService;
  readonly syncService: SyncService;
}

export const systemRoutes: FastifyPluginAsyncTypebox<RouteOptions> = async (app, options) => {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthStatusSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    (request) => ({ requestId: request.id, status: "ok" as const })
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: ReadinessStatusSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      if (!(await options.dashboardService.isReady())) {
        return sendProblem(reply, request, {
          detail: "PostgreSQL is not reachable.",
          instance: request.url,
          status: 503,
          title: "API not ready",
          type: "urn:nivalis:problem:database-unavailable"
        });
      }
      return { database: "reachable" as const, requestId: request.id, status: "ready" as const };
    }
  );
};

export const dashboardRoutes: FastifyPluginAsyncTypebox<RouteOptions> = async (app, options) => {
  app.get(
    "/v1/public/profile",
    {
      schema: {
        response: { 200: ProfileSchema, 404: ProblemDetailsSchema, default: ProblemDetailsSchema }
      }
    },
    async () => {
      const profile = await options.dashboardService.getPublicProfile();
      return { ...profile, tags: [...profile.tags] };
    }
  );

  app.get(
    "/v1/public/dashboards/about",
    {
      schema: {
        response: {
          200: DashboardReadModelSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (_request, reply) => {
      const dashboard = await options.readService.getPublishedDashboard();
      return reply
        .header("etag", formatViewEtag(dashboard.viewVersion))
        .send(serializePublicDashboard(dashboard));
    }
  );

  app.get(
    "/v1/me/dashboards/about/draft",
    {
      schema: {
        response: {
          200: DashboardStateSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const dashboard = await options.dashboardService.getDraftDashboard(
        requireOwnerContext(request)
      );
      return reply
        .header("etag", formatRevisionEtag(dashboard.revisionId))
        .send(serializeDashboard(dashboard));
    }
  );

  app.get(
    "/v1/me/dashboards/about/data",
    {
      schema: {
        response: {
          200: DashboardLiveDataSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const snapshot = await options.readService.getDraftLiveData(requireOwnerContext(request));
      return reply
        .header("etag", formatDataEtag(snapshot.dataVersion))
        .send(serializeLiveData(snapshot));
    }
  );

  app.put(
    "/v1/me/dashboards/about/draft",
    {
      schema: {
        body: DashboardDraftUpdateSchema,
        headers: IfMatchHeadersSchema,
        response: {
          200: DashboardStateSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          412: RevisionConflictProblemSchema,
          422: ProblemDetailsSchema,
          428: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const expectedRevisionId = parseRequiredRevisionEtag(request.headers["if-match"]);
      const saved = await options.dashboardService.saveDraft(
        requireOwnerContext(request),
        expectedRevisionId,
        deserializeDraftUpdate(request.body)
      );
      request.log.info(
        {
          dashboardId: "about",
          newRevisionId: saved.revisionId,
          operation: "save",
          previousRevisionId: expectedRevisionId
        },
        "Dashboard Draft revision created"
      );
      return reply
        .header("etag", formatRevisionEtag(saved.revisionId))
        .send(serializeDashboard(saved));
    }
  );

  app.post(
    "/v1/me/dashboards/about/publish",
    {
      schema: {
        headers: IfMatchHeadersSchema,
        response: {
          200: DashboardStateSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          412: RevisionConflictProblemSchema,
          422: ProblemDetailsSchema,
          428: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const expectedRevisionId = parseRequiredRevisionEtag(request.headers["if-match"]);
      const published = await options.dashboardService.publish(
        requireOwnerContext(request),
        expectedRevisionId
      );
      request.log.info(
        {
          dashboardId: "about",
          newRevisionId: published.revisionId,
          operation: "publish",
          previousRevisionId: expectedRevisionId
        },
        "Dashboard revision published"
      );
      return reply
        .header("etag", formatRevisionEtag(published.revisionId))
        .send(serializeDashboard(published));
    }
  );

  app.get(
    "/v1/me/dashboards/about/revisions",
    {
      schema: {
        querystring: RevisionListQuerySchema,
        response: {
          200: DashboardRevisionListSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request) => {
      const page = await options.dashboardService.listRevisions(requireOwnerContext(request), {
        ...(request.query.cursor
          ? { beforeRevisionNumber: Number(request.query.cursor.slice(4)) }
          : {}),
        limit: request.query.limit ?? 20
      });
      return {
        items: page.items.map(serializeRevisionMetadata),
        nextCursor: encodeRevisionCursor(page.nextCursorRevisionNumber)
      };
    }
  );

  app.get(
    "/v1/me/dashboards/about/revisions/:revisionId",
    {
      schema: {
        params: RevisionIdParamsSchema,
        response: {
          200: DashboardRevisionDetailSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const revision = await options.dashboardService.getRevision(
        requireOwnerContext(request),
        request.params.revisionId
      );
      return reply
        .header("etag", formatRevisionEtag(revision.revisionId))
        .send(serializeRevisionDetail(revision));
    }
  );

  app.post(
    "/v1/me/dashboards/about/revisions/:revisionId/restore",
    {
      schema: {
        headers: IfMatchHeadersSchema,
        params: RevisionIdParamsSchema,
        response: {
          200: DashboardStateSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          412: RevisionConflictProblemSchema,
          422: ProblemDetailsSchema,
          428: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const expectedRevisionId = parseRequiredRevisionEtag(request.headers["if-match"]);
      const restored = await options.dashboardService.restoreRevision(
        requireOwnerContext(request),
        expectedRevisionId,
        request.params.revisionId
      );
      request.log.info(
        {
          dashboardId: "about",
          newRevisionId: restored.revisionId,
          operation: "restore",
          previousRevisionId: expectedRevisionId
        },
        "Dashboard revision restored into Draft"
      );
      return reply
        .header("etag", formatRevisionEtag(restored.revisionId))
        .send(serializeDashboard(restored));
    }
  );
};

export const widgetRoutes: FastifyPluginAsyncTypebox<RouteOptions> = async (app, options) => {
  app.post(
    "/v1/me/dashboards/about/widgets",
    {
      schema: {
        body: CreateWidgetInputSchema,
        headers: IfMatchHeadersSchema,
        response: {
          201: WidgetConfigurationSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
          412: RevisionConflictProblemSchema,
          422: ProblemDetailsSchema,
          428: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const expectedRevisionId = parseRequiredRevisionEtag(request.headers["if-match"]);
      const draft = await options.dashboardService.createWidget(
        requireOwnerContext(request),
        expectedRevisionId,
        deserializeWidget(request.body.widget),
        deserializePlacement(request.body)
      );
      const widget = draft.widgets.find((candidate) => candidate.id === request.body.widget.id);
      if (!widget) throw new Error("Created Widget was absent from the new Draft revision.");
      request.log.info(
        {
          dashboardId: "about",
          newRevisionId: draft.revisionId,
          operation: "widget_add",
          previousRevisionId: expectedRevisionId
        },
        "Dashboard Widget revision created"
      );
      return reply
        .code(201)
        .header("location", `/v1/me/widgets/${widget.id}`)
        .header("etag", formatRevisionEtag(draft.revisionId))
        .send(serializeWidgetConfiguration(widget));
    }
  );

  app.patch(
    "/v1/me/widgets/:widgetId",
    {
      schema: {
        body: UpdateWidgetInputSchema,
        headers: IfMatchHeadersSchema,
        params: WidgetIdParamsSchema,
        response: {
          200: WidgetConfigurationSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          412: RevisionConflictProblemSchema,
          422: ProblemDetailsSchema,
          428: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const expectedRevisionId = parseRequiredRevisionEtag(request.headers["if-match"]);
      const draft = await options.dashboardService.updateWidget(
        requireOwnerContext(request),
        expectedRevisionId,
        request.params.widgetId,
        deserializeWidgetPatch(request.body)
      );
      const widget = draft.widgets.find((candidate) => candidate.id === request.params.widgetId);
      if (!widget) throw new Error("Updated Widget was absent from the new Draft revision.");
      request.log.info(
        {
          dashboardId: "about",
          newRevisionId: draft.revisionId,
          operation: "widget_update",
          previousRevisionId: expectedRevisionId
        },
        "Dashboard Widget revision created"
      );
      return reply
        .header("etag", formatRevisionEtag(draft.revisionId))
        .send(serializeWidgetConfiguration(widget));
    }
  );

  app.delete(
    "/v1/me/widgets/:widgetId",
    {
      schema: {
        headers: IfMatchHeadersSchema,
        params: WidgetIdParamsSchema,
        response: {
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          412: RevisionConflictProblemSchema,
          428: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const expectedRevisionId = parseRequiredRevisionEtag(request.headers["if-match"]);
      const draft = await options.dashboardService.deleteWidget(
        requireOwnerContext(request),
        expectedRevisionId,
        request.params.widgetId
      );
      request.log.info(
        {
          dashboardId: "about",
          newRevisionId: draft.revisionId,
          operation: "widget_delete",
          previousRevisionId: expectedRevisionId
        },
        "Dashboard Widget revision created"
      );
      reply.code(204).header("etag", formatRevisionEtag(draft.revisionId));
    }
  );
};

export const deferredRoutes: FastifyPluginAsyncTypebox<RouteOptions> = async (app, options) => {
  app.get(
    "/v1/me/providers",
    {
      schema: {
        response: {
          200: ProviderConnectionListSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request) => ({
      providers: (await options.providerConnectionService.list(requireOwnerContext(request))).map(
        serializeProviderConnection
      )
    })
  );

  app.get(
    "/v1/me/providers/netease",
    {
      schema: {
        response: {
          200: ProviderConnectionSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request) =>
      serializeProviderConnection(
        await options.providerConnectionService.getNetease(requireOwnerContext(request))
      )
  );

  app.get(
    "/v1/me/providers/netease/data",
    {
      schema: {
        response: {
          200: NeteaseDataCatalogSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const catalog = await options.providerDataService.getNeteaseCatalog(
        requireOwnerContext(request)
      );
      return reply.header("etag", formatCatalogEtag(catalog.dataVersion)).send({
        ...catalog,
        generatedAt: catalog.generatedAt.toISOString()
      });
    }
  );

  app.post(
    "/v1/me/providers/netease/connect",
    {
      schema: {
        body: NeteaseConnectInputSchema,
        response: {
          202: ProviderConnectAcceptedSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      await options.providerAuthService.assertNoActive(requireOwnerContext(request));
      const accepted = await options.providerConnectionService.connectNetease(
        requireOwnerContext(request),
        request.body.credentialType,
        request.body.credential
      );
      return reply
        .code(202)
        .header("location", `/v1/me/sync-jobs/${accepted.validationJob.id}`)
        .send({
          connection: serializeProviderConnection(accepted.connection),
          validationJob: serializeSyncJob(accepted.validationJob)
        });
    }
  );

  app.post(
    "/v1/me/providers/netease/auth-attempts/qr",
    {
      schema: {
        response: {
          202: ProviderAuthAttemptSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const attempt = await options.providerAuthService.startQr(requireOwnerContext(request));
      return reply
        .code(202)
        .header("location", `/v1/me/providers/netease/auth-attempts/${attempt.id}`)
        .send(serializeProviderAuthAttempt(attempt));
    }
  );

  app.post(
    "/v1/me/providers/netease/auth-attempts/sms",
    {
      schema: {
        body: NeteaseSmsAuthInputSchema,
        response: {
          202: ProviderAuthAttemptSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const attempt = await options.providerAuthService.startSms(
        requireOwnerContext(request),
        request.body.phone,
        request.body.countryCode
      );
      return reply
        .code(202)
        .header("location", `/v1/me/providers/netease/auth-attempts/${attempt.id}`)
        .send(serializeProviderAuthAttempt(attempt));
    }
  );

  app.get(
    "/v1/me/providers/netease/auth-attempts/:attemptId",
    {
      schema: {
        params: ProviderAuthAttemptParamsSchema,
        response: {
          200: ProviderAuthAttemptSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request) =>
      serializeProviderAuthAttempt(
        await options.providerAuthService.get(
          requireOwnerContext(request),
          request.params.attemptId
        )
      )
  );

  app.delete(
    "/v1/me/providers/netease/auth-attempts/:attemptId",
    {
      schema: {
        params: ProviderAuthAttemptParamsSchema,
        response: {
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      await options.providerAuthService.cancel(
        requireOwnerContext(request),
        request.params.attemptId
      );
      reply.code(204);
    }
  );

  app.post(
    "/v1/me/providers/netease/auth-attempts/:attemptId/verify",
    {
      schema: {
        body: NeteaseSmsVerifyInputSchema,
        params: ProviderAuthAttemptParamsSchema,
        response: {
          202: ProviderAuthAttemptSchema,
          400: ProblemDetailsSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const attempt = await options.providerAuthService.verifySms(
        requireOwnerContext(request),
        request.params.attemptId,
        request.body.code
      );
      return reply.code(202).send(serializeProviderAuthAttempt(attempt));
    }
  );

  app.delete(
    "/v1/me/providers/netease/connection",
    {
      schema: {
        response: {
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const context = requireOwnerContext(request);
      await options.providerAuthService.cancelAll(context);
      await options.providerConnectionService.disconnectNetease(context);
      reply.code(204);
    }
  );

  app.get(
    "/v1/me/providers/status",
    {
      schema: {
        response: {
          200: ProviderStatusListSchema,
          403: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request) => ({
      providers: (await options.syncService.listProviderStatus(requireOwnerContext(request))).map(
        serializeProviderStatus
      )
    })
  );

  app.post(
    "/v1/me/providers/:provider/sync",
    {
      schema: {
        params: ProviderParamsSchema,
        response: {
          202: SyncJobSchema,
          400: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const run = await options.syncService.enqueue(
        requireOwnerContext(request),
        request.params.provider
      );
      request.log.info({ provider: run.provider, syncRunId: run.id }, "Provider SyncRun accepted");
      return reply
        .code(202)
        .header("location", `/v1/me/sync-jobs/${run.id}`)
        .send(serializeSyncJob(run));
    }
  );

  app.get(
    "/v1/me/sync-jobs/:jobId",
    {
      schema: {
        params: JobParamsSchema,
        response: {
          200: SyncJobSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request) =>
      serializeSyncJob(
        await options.syncService.getRun(requireOwnerContext(request), request.params.jobId)
      )
  );

  app.get(
    "/v1/me/settings/appearance",
    {
      schema: {
        response: {
          403: ProblemDetailsSchema,
          501: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    (request, reply) => sendSettingsNotImplemented(request, reply)
  );

  app.put(
    "/v1/me/settings/appearance",
    {
      schema: {
        body: AppearanceSettingsSchema,
        response: {
          403: ProblemDetailsSchema,
          501: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    (request, reply) => sendSettingsNotImplemented(request, reply)
  );
};

function sendSettingsNotImplemented(
  request: Parameters<typeof sendProblem>[1],
  reply: Parameters<typeof sendProblem>[0]
) {
  return sendProblem(reply, request, {
    detail: "Appearance remains browser-local in Phase 5; server persistence is not implemented.",
    instance: request.url,
    status: 501,
    title: "Appearance persistence not implemented",
    type: "urn:nivalis:problem:appearance-not-implemented"
  });
}
