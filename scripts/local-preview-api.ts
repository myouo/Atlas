import { createServer } from "node:http";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type {
  DashboardReadModel,
  DashboardState,
  ProviderStatus,
  SyncJob,
  WidgetConfiguration,
  WidgetProjection
} from "@nivalis/api-client";
import type {
  NormalizedProviderData,
  ProjectionTarget,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";

import {
  buildNeteaseOwnerDataCatalog,
  NeteaseClient,
  NeteaseConnector,
  NeteaseNormalizer,
  NeteaseProjector
} from "../packages/connectors/src/index";
import { addWidgetToLayouts } from "../apps/web/features/dashboard/layout-engine";
import { createMockWidget, mockDashboard } from "../apps/web/features/dashboard/mock-dashboard";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const localEnvironment = `${workspaceRoot}.env.local`;
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);

const host = "127.0.0.1";
const port = integerEnvironment("NIVALIS_PREVIEW_API_PORT", 4174);
const webPort = integerEnvironment("NIVALIS_PREVIEW_WEB_PORT", 3000);
const credential = process.env.NETEASE_INTEGRATION_MUSIC_U?.trim();
if (!credential) throw new Error("NETEASE_INTEGRATION_MUSIC_U is required in .env.local.");

const actorId = "00000000-0000-4000-8000-000000000001";
const providerConnectionId = "00000000-0000-4000-8000-000000000501";
const allowedOrigins = new Set([`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`]);
let current: PreviewState | null = null;
let loading: Promise<PreviewState> | null = null;
let draftOverride: DashboardState | null = null;
let publishedOverride: DashboardState | null = null;
const syncJobs = new Map<string, SyncJob>();

interface PreviewState {
  readonly base: DashboardReadModel;
  readonly catalog: Record<string, unknown>;
  readonly dataVersion: string;
  readonly generatedAt: string;
  readonly normalized: NormalizedProviderData;
  readonly widgets: readonly WidgetProjection[];
}

queueMicrotask(() => void refreshProviderData());

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    send(response, 403, problem(403, "origin-not-allowed", "Origin not allowed"));
    return;
  }
  const cors = origin
    ? {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type, If-Match",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Expose-Headers": "ETag, Location",
        Vary: "Origin"
      }
    : {};
  if (request.method === "OPTIONS") {
    empty(response, 204, cors);
    return;
  }

  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      send(response, 200, { mode: "local-preview", status: "ok" }, cors);
      return;
    }
    const state = await getPreviewState();
    if (request.method === "GET" && url.pathname === "/v1/auth/session") {
      send(
        response,
        200,
        {
          actorId,
          authenticated: true,
          expiresAt: "2099-01-01T00:00:00.000Z",
          role: "owner"
        },
        cors
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
      empty(response, 204, cors);
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/public/dashboards/about") {
      send(response, 200, await publicDashboard(state), cors, {
        ETag: `"view:${state.dataVersion}"`
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/dashboards/about/draft") {
      const draft = draftOverride ?? configurationState(state, "draft");
      send(response, 200, draft, cors, { ETag: revisionEtag(draft) });
      return;
    }
    if (request.method === "PUT" && url.pathname === "/v1/me/dashboards/about/draft") {
      const body = await readObject(request);
      const previous = draftOverride ?? configurationState(state, "draft");
      draftOverride = {
        ...previous,
        layout: body.layout as DashboardState["layout"],
        revision: previous.revision + 1,
        revisionId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        widgets: body.widgets as WidgetConfiguration[]
      };
      send(response, 200, draftOverride, cors, { ETag: revisionEtag(draftOverride) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/me/dashboards/about/publish") {
      const draft = draftOverride ?? configurationState(state, "draft");
      publishedOverride = { ...draft, state: "published", updatedAt: new Date().toISOString() };
      send(response, 200, publishedOverride, cors, { ETag: revisionEtag(publishedOverride) });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/dashboards/about/data") {
      const draft = draftOverride ?? configurationState(state, "draft");
      send(
        response,
        200,
        {
          configurationRevisionId: draft.revisionId,
          dashboardId: "about",
          generatedAt: state.generatedAt,
          projectionVersions: [],
          widgets: await projectConfigurations(state, draft.widgets)
        },
        cors,
        { ETag: `"data:${state.dataVersion}"` }
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/providers/status") {
      send(response, 200, { providers: providerStatuses(state.generatedAt) }, cors);
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/providers") {
      send(response, 200, { providers: [providerConnection(state)] }, cors);
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/providers/netease") {
      send(response, 200, providerConnection(state), cors);
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/providers/netease/data") {
      send(
        response,
        200,
        {
          catalog: state.catalog,
          dataVersion: state.dataVersion,
          generatedAt: state.generatedAt,
          provider: "netease",
          schemaVersion: 1
        },
        cors,
        { ETag: `"catalog:${state.dataVersion}"` }
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/me/providers/netease/sync") {
      const job = createSyncJob();
      syncJobs.set(job.jobId, job);
      void runLocalSync(job.jobId);
      send(response, 202, job, cors, {
        Location: `/v1/me/sync-jobs/${job.jobId}`
      });
      return;
    }
    const syncJobId = url.pathname.match(/^\/v1\/me\/sync-jobs\/([^/]+)$/)?.[1];
    if (request.method === "GET" && syncJobId) {
      const job = syncJobs.get(syncJobId);
      if (!job) {
        send(response, 404, problem(404, "sync-run-not-found", "SyncRun not found"), cors);
        return;
      }
      send(response, 200, job, cors);
      return;
    }

    send(
      response,
      501,
      problem(501, "local-preview-not-implemented", "Capability is not needed by local preview"),
      cors
    );
  } catch (error) {
    console.error(
      `Local preview request failed: ${error instanceof Error ? error.name : "UnknownError"}`
    );
    send(
      response,
      502,
      problem(502, "local-preview-provider-failed", "Local Provider preview failed"),
      cors
    );
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Local Preview API port ${port} is already in use. Reuse the running preview or choose NIVALIS_PREVIEW_API_PORT.`
    );
  } else {
    console.error(`Local Preview API failed to listen: ${error.message}`);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Local Nivalis Preview API: http://${host}:${port}`);
  console.log("NetEase MUSIC_U stays in this loopback-only process.");
});

async function getPreviewState() {
  if (current) return current;
  return refreshProviderData();
}

function refreshProviderData() {
  if (loading) return loading;
  loading = buildPreviewState().then(
    (state) => {
      current = state;
      loading = null;
      console.log(
        `Local Provider projection ready: ${state.widgets.filter((widget) => widget.provider === "netease").length} NetEase widget(s).`
      );
      return state;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    }
  );
  return loading;
}

async function buildPreviewState(): Promise<PreviewState> {
  console.log("Refreshing real NetEase data in memory; no database will be used.");
  const base = pureLocalDashboard();

  const now = new Date();
  const run = previewSyncRun(now);
  const connector = new NeteaseConnector(
    new NeteaseClient({ timeoutMs: 10_000 }),
    { resolve: async () => credential! },
    () => new Date()
  );
  const fetched = await connector.fetch(run);
  const snapshots = fetched.map((item, index): RawSnapshot => ({
    createdAt: item.fetchedAt,
    fetchedAt: item.fetchedAt,
    id: crypto.randomUUID(),
    payload: item.payload,
    payloadHash: String(index).padStart(64, "0"),
    provider: "netease",
    providerConnectionId,
    schemaVersion: item.schemaVersion,
    sourceCursor: item.sourceCursor ?? null,
    sourceKind: item.sourceKind,
    sourceTimestamp: item.sourceTimestamp ?? null,
    syncRunId: run.id
  }));
  const normalized = await new NeteaseNormalizer().normalize(snapshots);
  const targets = base.widgets.flatMap((widget, index): ProjectionTarget[] =>
    widget.provider === "netease" && widget.type.startsWith("music.netease.")
      ? [
          {
            dataConfig: widget.dataConfig,
            enabled: widget.enabled,
            id: widget.id,
            presentationConfig: widget.presentationConfig,
            projectionKey: `local-preview-${index}`.padEnd(64, "0").slice(0, 64),
            provider: "netease",
            schemaVersion: widget.schemaVersion,
            title: widget.title,
            type: widget.type
          }
        ]
      : []
  );
  const built = await new NeteaseProjector().project(normalized, targets);
  const byWidget = new Map(built.map((projection) => [projection.widgetId, projection]));
  const generatedAt = new Date().toISOString();
  const widgets = base.widgets.map((widget): WidgetProjection => {
    const projection = byWidget.get(widget.id);
    return projection
      ? {
          ...widget,
          data: projection.data,
          stale: false,
          updatedAt: generatedAt
        }
      : widget;
  });
  return {
    base,
    catalog: buildNeteaseOwnerDataCatalog(normalized.payload) as Record<string, unknown>,
    dataVersion: crypto.randomUUID(),
    generatedAt,
    normalized,
    widgets
  };
}

const localNeteaseWidgets = [
  {
    id: "00000000-0000-4000-8000-000000009201",
    schemaVersion: 2,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 5 }, sm: { h: 12, w: 4 } },
    type: "music.netease.overview"
  },
  {
    id: "00000000-0000-4000-8000-000000009202",
    schemaVersion: 1,
    sizes: { lg: { h: 5, w: 4 }, md: { h: 5, w: 4 }, sm: { h: 7, w: 4 } },
    type: "music.netease.identity"
  },
  {
    id: "00000000-0000-4000-8000-000000009203",
    schemaVersion: 1,
    sizes: { lg: { h: 4, w: 4 }, md: { h: 4, w: 4 }, sm: { h: 6, w: 4 } },
    type: "music.netease.listening"
  },
  {
    id: "00000000-0000-4000-8000-000000009204",
    schemaVersion: 2,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 5 }, sm: { h: 10, w: 4 } },
    type: "music.netease.ranking"
  },
  {
    dataConfig: { publicLimit: 8, publicLists: ["following"], view: "following" },
    id: "00000000-0000-4000-8000-000000009205",
    schemaVersion: 1,
    sizes: { lg: { h: 5, w: 4 }, md: { h: 5, w: 4 }, sm: { h: 7, w: 4 } },
    title: "网易云 · 关注",
    type: "music.netease.social"
  },
  {
    dataConfig: { publicLimit: 8, publicLists: ["followers"], view: "followers" },
    id: "00000000-0000-4000-8000-000000009208",
    schemaVersion: 1,
    sizes: { lg: { h: 5, w: 4 }, md: { h: 5, w: 4 }, sm: { h: 7, w: 4 } },
    title: "网易云 · 粉丝",
    type: "music.netease.social"
  },
  {
    id: "00000000-0000-4000-8000-000000009206",
    schemaVersion: 1,
    sizes: { lg: { h: 6, w: 4 }, md: { h: 6, w: 4 }, sm: { h: 9, w: 4 } },
    type: "music.netease.playlists"
  },
  {
    id: "00000000-0000-4000-8000-000000009207",
    schemaVersion: 2,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 5 }, sm: { h: 10, w: 4 } },
    type: "music.netease.showcase"
  }
] as const;

function pureLocalDashboard(): DashboardReadModel {
  const removedIds = new Set(
    mockDashboard.widgets
      .filter((widget) => widget.type.startsWith("music.netease."))
      .map((widget) => widget.id)
  );
  let layout = {
    lg: mockDashboard.layout.lg.filter((item) => !removedIds.has(item.i)),
    md: mockDashboard.layout.md.filter((item) => !removedIds.has(item.i)),
    sm: mockDashboard.layout.sm.filter((item) => !removedIds.has(item.i))
  };
  const widgets = mockDashboard.widgets.filter(
    (widget) => !widget.type.startsWith("music.netease.")
  );
  for (const definition of localNeteaseWidgets) {
    const baseWidget = createMockWidget(definition.type, definition.id, definition.schemaVersion);
    const widget =
      "dataConfig" in definition
        ? {
            ...baseWidget,
            dataConfig: definition.dataConfig,
            title: definition.title
          }
        : baseWidget;
    widgets.push(widget);
    layout = addWidgetToLayouts(layout, widget.id, definition.sizes);
  }
  return { ...mockDashboard, layout, revision: 1, widgets };
}

function configurationState(state: PreviewState, mode: "draft" | "published"): DashboardState {
  return {
    dashboardId: "about",
    layout: state.base.layout,
    profile: state.base.profile,
    revision: state.base.revision,
    revisionId: "00000000-0000-4000-8000-000000000301",
    state: mode,
    updatedAt: state.generatedAt,
    widgets: state.widgets.map(toConfiguration)
  };
}

async function publicDashboard(state: PreviewState): Promise<DashboardReadModel> {
  const configuration = publishedOverride;
  if (!configuration) return { ...state.base, widgets: state.widgets };
  return {
    dashboardId: "about",
    layout: configuration.layout,
    profile: configuration.profile,
    revision: configuration.revision,
    widgets: await projectConfigurations(state, configuration.widgets)
  };
}

async function projectConfigurations(
  state: PreviewState,
  configurations: readonly WidgetConfiguration[]
): Promise<readonly WidgetProjection[]> {
  const targets = configurations.flatMap((widget, index): ProjectionTarget[] =>
    widget.provider === "netease" && widget.type.startsWith("music.netease.")
      ? [
          {
            dataConfig: widget.dataConfig,
            enabled: widget.enabled,
            id: widget.id,
            presentationConfig: widget.presentationConfig,
            projectionKey: `local-draft-${index}`.padEnd(64, "0").slice(0, 64),
            provider: "netease",
            schemaVersion: widget.schemaVersion,
            title: widget.title,
            type: widget.type
          }
        ]
      : []
  );
  const built = await new NeteaseProjector().project(state.normalized, targets);
  const builtById = new Map(built.map((projection) => [projection.widgetId, projection]));
  const existingById = new Map(state.widgets.map((widget) => [widget.id, widget]));
  return configurations.map((configuration): WidgetProjection => {
    const projection = builtById.get(configuration.id);
    if (projection) {
      return {
        ...configuration,
        data: projection.data,
        stale: false,
        updatedAt: state.generatedAt
      } as WidgetProjection;
    }
    const existing = existingById.get(configuration.id);
    if (existing) return { ...existing, ...configuration } as WidgetProjection;
    return {
      ...createMockWidget(configuration.type, configuration.id, configuration.schemaVersion),
      ...configuration
    } as WidgetProjection;
  });
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

function providerConnection(state: PreviewState) {
  const account = objectValue(state.catalog.account);
  return {
    configured: true,
    credentialStatus: "valid",
    credentialUpdatedAt: state.generatedAt,
    displayName: stringValue(account?.displayName),
    enabled: true,
    lastValidatedAt: state.generatedAt,
    provider: "netease",
    providerAccountId: stringValue(account?.providerUserId)
  } as const;
}

function providerStatuses(timestamp: string): readonly ProviderStatus[] {
  const netease: ProviderStatus = {
    attemptCount: 1,
    connection: "connected",
    credentialStatus: "valid",
    lastAttemptAt: timestamp,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastSuccessAt: timestamp,
    provider: "netease",
    syncStatus: "completed"
  };
  const fixtures = (["github", "bilibili", "steam", "bangumi"] as const).map(
    (provider): ProviderStatus => ({
      attemptCount: 0,
      connection: "fixture",
      credentialStatus: "valid",
      lastAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSuccessAt: null,
      provider,
      syncStatus: "idle"
    })
  );
  return [netease, ...fixtures];
}

function createSyncJob(): SyncJob {
  return {
    attemptCount: 0,
    finishedAt: null,
    jobId: crypto.randomUUID(),
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "netease",
    requestedAt: new Date().toISOString(),
    startedAt: null,
    status: "queued"
  };
}

async function runLocalSync(jobId: string) {
  const queued = syncJobs.get(jobId);
  if (!queued) return;
  const startedAt = new Date().toISOString();
  syncJobs.set(jobId, { ...queued, attemptCount: 1, startedAt, status: "running" });
  current = null;
  try {
    await refreshProviderData();
    syncJobs.set(jobId, {
      ...syncJobs.get(jobId)!,
      finishedAt: new Date().toISOString(),
      status: "completed"
    });
  } catch (error) {
    syncJobs.set(jobId, {
      ...syncJobs.get(jobId)!,
      finishedAt: new Date().toISOString(),
      lastErrorCode: error instanceof Error ? error.name : "preview_failed",
      lastErrorMessage: "Local Provider preview refresh failed.",
      status: "failed"
    });
  }
}

function previewSyncRun(now: Date): SyncRun {
  return {
    attemptCount: 0,
    finishedAt: null,
    id: crypto.randomUUID(),
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "netease",
    providerConnectionId,
    queueJobId: null,
    requestedAt: now,
    startedAt: now,
    status: "running"
  };
}

function revisionEtag(state: DashboardState) {
  return `"rev:${state.revisionId}"`;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerEnvironment(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return value;
}

async function readObject(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 1_000_000) throw new Error("Local preview request body is too large.");
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  const object = objectValue(parsed);
  if (!object) throw new Error("Local preview request body must be an object.");
  return object;
}

function problem(status: number, type: string, title: string) {
  return { status, title, type: `urn:nivalis:problem:${type}` };
}

function send(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  extraHeaders: Record<string, string> = {}
) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    ...headers,
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function empty(
  response: import("node:http").ServerResponse,
  status: number,
  headers: Record<string, string>
) {
  response.writeHead(status, headers);
  response.end();
}
