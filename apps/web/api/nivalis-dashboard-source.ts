import { createNivalisClient } from "@nivalis/api-client";
import type {
  components,
  DashboardState,
  WidgetConfiguration,
  WidgetProjection
} from "@nivalis/api-client";

import type {
  DashboardConcurrencyToken,
  DashboardDataSource,
  DashboardEditableDraft,
  HydratedDashboardState,
  VersionedDashboardState
} from "./dashboard-source";
import { RevisionConflictError } from "./dashboard-source";

export class DashboardSourceError extends Error {
  constructor(
    message: string,
    readonly problem?: components["schemas"]["ProblemDetails"]
  ) {
    super(message);
    this.name = "DashboardSourceError";
  }
}

export function createApiDashboardSource(baseUrl: string): DashboardDataSource {
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required in API dashboard mode.");
  }
  const client = createNivalisClient(baseUrl);
  let latestDraftWidgets: readonly WidgetProjection[] = [];

  return {
    kind: "api",
    async getAuthSession() {
      return requireData(await client.GET("/v1/auth/session"), "Authentication state failed.");
    },
    async startAuthentication() {
      const started = requireData(
        await client.POST("/v1/auth/github/start"),
        "GitHub authentication could not be started."
      );
      return { authorizationUrl: started.authorizationUrl };
    },
    async getProviderConnections() {
      const response = await client.GET("/v1/me/providers");
      return requireData(response, "Provider connections could not be loaded.").providers;
    },
    async getNeteaseConnection() {
      return requireData(
        await client.GET("/v1/me/providers/netease"),
        "The NetEase connection could not be loaded."
      );
    },
    async getNeteaseDataCatalog() {
      return requireData(
        await client.GET("/v1/me/providers/netease/data"),
        "The NetEase data catalog could not be loaded."
      );
    },
    async startNeteaseQrAuth() {
      return requireData(
        await client.POST("/v1/me/providers/netease/auth-attempts/qr"),
        "The NetEase QR login could not be started."
      );
    },
    async cancelNeteaseAuthAttempt(attemptId) {
      const response = await client.DELETE("/v1/me/providers/netease/auth-attempts/{attemptId}", {
        params: { path: { attemptId } }
      });
      if (response.error || response.response.status !== 204) {
        throwMappedError(response, "The NetEase login attempt could not be cancelled.");
      }
    },
    async startNeteaseSmsAuth(phone, countryCode) {
      return requireData(
        await client.POST("/v1/me/providers/netease/auth-attempts/sms", {
          body: { countryCode, phone }
        }),
        "The NetEase SMS login could not be started."
      );
    },
    async getNeteaseAuthAttempt(attemptId) {
      return requireData(
        await client.GET("/v1/me/providers/netease/auth-attempts/{attemptId}", {
          params: { path: { attemptId } }
        }),
        "The NetEase login state could not be loaded."
      );
    },
    async verifyNeteaseSmsAuth(attemptId, code) {
      return requireData(
        await client.POST("/v1/me/providers/netease/auth-attempts/{attemptId}/verify", {
          body: { code },
          params: { path: { attemptId } }
        }),
        "The NetEase SMS code could not be verified."
      );
    },
    async connectNetease(credential) {
      return requireData(
        await client.POST("/v1/me/providers/netease/connect", {
          body: { credential, credentialType: "music_u" }
        }),
        "The NetEase credential could not be stored."
      );
    },
    async disconnectNetease() {
      const response = await client.DELETE("/v1/me/providers/netease/connection");
      if (response.error || response.response.status !== 204) {
        throwMappedError(response, "The NetEase connection could not be disconnected.");
      }
    },
    async logout() {
      const response = await client.POST("/v1/auth/logout");
      if (response.error || response.response.status !== 204) {
        throwMappedError(response, "Logout failed.");
      }
    },
    async enqueueProviderSync(provider) {
      const response = await client.POST("/v1/me/providers/{provider}/sync", {
        params: { path: { provider } }
      });
      return requireData(response, "The Provider synchronization could not be queued.");
    },
    async getSyncJob(jobId) {
      const response = await client.GET("/v1/me/sync-jobs/{jobId}", {
        params: { path: { jobId } }
      });
      return requireData(response, "The SyncRun state could not be loaded.");
    },
    async load() {
      const [publishedResponse, sessionResponse] = await Promise.all([
        client.GET("/v1/public/dashboards/about"),
        client.GET("/v1/auth/session")
      ]);
      const published = requireData(
        publishedResponse,
        "The Published Dashboard could not be loaded."
      );
      const session = requireData(sessionResponse, "Authentication state could not be loaded.");
      if (!session.authenticated || session.role !== "owner") {
        return { draft: null, providerStatuses: [], published, session };
      }
      const [draft, liveData, statuses] = await Promise.all([
        client.GET("/v1/me/dashboards/about/draft"),
        client.GET("/v1/me/dashboards/about/data"),
        client.GET("/v1/me/providers/status")
      ]);
      const projections = requireData(liveData, "Live Widget data could not be loaded.").widgets;
      latestDraftWidgets = projections;
      return {
        draft: requireVersioned(draft, "The persisted Draft could not be loaded.", projections),
        providerStatuses: requireData(statuses, "Provider status could not be loaded.").providers,
        published,
        session
      };
    },
    async saveDraft(input, concurrencyToken) {
      const response = await client.PUT("/v1/me/dashboards/about/draft", {
        body: toConfigurationUpdate(input),
        params: { header: { "If-Match": concurrencyToken } }
      });
      const saved = requireVersioned(response, "The Draft could not be saved.", [
        ...input.widgets,
        ...latestDraftWidgets
      ]);
      latestDraftWidgets = saved.dashboard.widgets;
      return saved;
    },
    async publishDraft(input, concurrencyToken) {
      const response = await client.POST("/v1/me/dashboards/about/publish", {
        params: { header: { "If-Match": concurrencyToken } }
      });
      return requireVersioned(response, "The Draft could not be published.", [
        ...input.widgets,
        ...latestDraftWidgets
      ]);
    },
    async listRevisions(options = {}) {
      const response = await client.GET("/v1/me/dashboards/about/revisions", {
        params: {
          query: {
            ...(options.cursor ? { cursor: options.cursor } : {}),
            ...(options.limit === undefined ? {} : { limit: options.limit })
          }
        }
      });
      return requireData(response, "Revision history could not be loaded.");
    },
    async getRevision(revisionId) {
      const response = await client.GET("/v1/me/dashboards/about/revisions/{revisionId}", {
        params: { path: { revisionId } }
      });
      return requireData(response, "The selected revision could not be loaded.");
    },
    async restoreRevision(revisionId, concurrencyToken) {
      const response = await client.POST("/v1/me/dashboards/about/revisions/{revisionId}/restore", {
        params: {
          header: { "If-Match": concurrencyToken },
          path: { revisionId }
        }
      });
      const liveData = await client.GET("/v1/me/dashboards/about/data");
      latestDraftWidgets = requireData(
        liveData,
        "The restored revision live data could not be loaded."
      ).widgets;
      return requireVersioned(
        response,
        "The selected revision could not be restored.",
        latestDraftWidgets
      );
    },
    async refreshProjections() {
      const [published, liveData, statuses] = await Promise.all([
        client.GET("/v1/public/dashboards/about"),
        client.GET("/v1/me/dashboards/about/data"),
        client.GET("/v1/me/providers/status")
      ]);
      latestDraftWidgets = requireData(
        liveData,
        "Live Widget data could not be refreshed."
      ).widgets;
      return {
        draftWidgets: latestDraftWidgets,
        providerStatuses: requireData(statuses, "Provider status could not be refreshed.")
          .providers,
        published: requireData(published, "The public Dashboard could not be refreshed.")
      };
    }
  };
}

interface ApiResponse<TData, TError> {
  readonly data?: TData;
  readonly error?: TError;
  readonly response: Response;
}

function requireData<TData, TError extends components["schemas"]["ProblemDetails"]>(
  response: ApiResponse<TData, TError>,
  message: string
): TData {
  if (response.error || response.data === undefined) {
    throwMappedError(response, message);
  }
  return response.data;
}

function requireVersioned<
  TData extends components["schemas"]["DashboardState"],
  TError extends components["schemas"]["ProblemDetails"]
>(
  response: ApiResponse<TData, TError>,
  message: string,
  projections: readonly WidgetProjection[]
): VersionedDashboardState {
  const dashboard = requireData(response, message);
  const concurrencyToken = response.response.headers.get("etag");
  if (!concurrencyToken) {
    throw new DashboardSourceError("The API response omitted its revision validator.");
  }
  return { concurrencyToken, dashboard: hydrateDashboard(dashboard, projections) };
}

function toConfigurationUpdate(input: DashboardEditableDraft) {
  return {
    layout: input.layout,
    widgets: input.widgets.map(toConfiguration)
  };
}

function toConfiguration(widget: WidgetProjection): WidgetConfiguration {
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

function hydrateDashboard(
  dashboard: DashboardState,
  projections: readonly WidgetProjection[]
): HydratedDashboardState {
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((configuration) => {
      const projection = projections.find((candidate) => sameProjection(candidate, configuration));
      if (!projection) {
        throw new DashboardSourceError(
          `Widget '${configuration.id}' has no projection for its current configuration.`
        );
      }
      return { ...projection, ...configuration } as WidgetProjection;
    })
  };
}

function sameProjection(projection: WidgetProjection, configuration: WidgetConfiguration): boolean {
  return (
    projection.id === configuration.id &&
    projection.type === configuration.type &&
    projection.provider === configuration.provider &&
    projection.schemaVersion === configuration.schemaVersion &&
    stableJson(projection.dataConfig) === stableJson(configuration.dataConfig)
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function throwMappedError<TData, TError extends components["schemas"]["ProblemDetails"]>(
  response: ApiResponse<TData, TError>,
  message: string
): never {
  if (response.response.status === 412 && response.error) {
    const conflict = response.error as Partial<components["schemas"]["RevisionConflictProblem"]>;
    if (
      typeof conflict.currentEtag === "string" &&
      typeof conflict.currentRevisionId === "string" &&
      typeof conflict.currentRevisionNumber === "number"
    ) {
      throw new RevisionConflictError(
        conflict.currentEtag as DashboardConcurrencyToken,
        conflict.currentRevisionId,
        conflict.currentRevisionNumber
      );
    }
  }
  throw new DashboardSourceError(message, response.error);
}
