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
  ProviderNormalizationInput,
  ProviderProjectionInput,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";
import {
  encodeProviderSourceContext,
  providerProtocolMetadata,
  toProviderSnapshotRecord,
  toProviderSyncRequest
} from "@nivalis/domain";

import {
  buildNeteaseOwnerDataCatalog,
  isNeteaseNormalizedPayload,
  NeteaseClient,
  NeteaseConnector,
  NeteaseNormalizer,
  NeteaseProjector,
  NETEASE_PROVIDER_MANIFEST
} from "../packages/connectors/src/index";
import {
  assertNormalizedProviderData,
  assertProviderCollection,
  assertProviderManifest,
  assertProviderNormalizationInput,
  assertProviderProjectionBatch,
  assertProviderProjectionInput,
  assertProviderProjectionSet,
  assertProviderSnapshotRecords,
  assertProviderSyncRequest
} from "../packages/application/src/index";
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
  assertProviderManifest(NETEASE_PROVIDER_MANIFEST, "netease");
  const collectionRequest = toProviderSyncRequest(run);
  assertProviderSyncRequest(collectionRequest, NETEASE_PROVIDER_MANIFEST);
  const collection = await connector.collect(collectionRequest);
  assertProviderCollection(collection, NETEASE_PROVIDER_MANIFEST, run.id);
  const fetched = collection.data.records;
  const snapshots = fetched.map((item, index): RawSnapshot => ({
    createdAt: new Date(item.meta.collectedAt),
    fetchedAt: new Date(item.meta.collectedAt),
    id: crypto.randomUUID(),
    payload: item.data,
    payloadHash: String(index).padStart(64, "0"),
    provider: "netease",
    providerConnectionId,
    schemaVersion: item.meta.schemaVersion,
    sourceCursor: encodeProviderSourceContext(item, collection.data),
    sourceKind: item.meta.source,
    sourceTimestamp: item.meta.sourceUpdatedAt ? new Date(item.meta.sourceUpdatedAt) : null,
    syncRunId: run.id
  }));
  const normalizationRecords = snapshots.map(toProviderSnapshotRecord);
  assertProviderSnapshotRecords(normalizationRecords, NETEASE_PROVIDER_MANIFEST, run.id);
  const normalizationInput = {
    data: {
      checkpoint: collection.data.checkpoint,
      collectionMode: collection.data.mode,
      collectionOutcome: collection.data.outcome,
      issues: collection.data.issues,
      previous: null,
      records: normalizationRecords
    },
    meta: providerProtocolMetadata("normalization.request", "netease", run.id)
  } satisfies ProviderNormalizationInput;
  assertProviderNormalizationInput(normalizationInput, NETEASE_PROVIDER_MANIFEST, run.id);
  const normalized = await new NeteaseNormalizer().normalize(normalizationInput);
  assertNormalizedProviderData(normalized, NETEASE_PROVIDER_MANIFEST, normalizationInput, run.id);
  if (!isNeteaseNormalizedPayload(normalized.data)) {
    throw new Error("NetEase normalized data did not match its declared schema.");
  }
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
  const projectionInput = {
    data: { normalized, targets },
    meta: providerProtocolMetadata("projection.request", "netease", run.id)
  } satisfies ProviderProjectionInput;
  assertProviderProjectionInput(projectionInput, NETEASE_PROVIDER_MANIFEST, run.id);
  const projected = await new NeteaseProjector().project(projectionInput);
  assertProviderProjectionBatch(projected, NETEASE_PROVIDER_MANIFEST, run.id);
  const built = projected.data;
  assertProviderProjectionSet(targets, built, normalized);
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
    catalog: buildNeteaseOwnerDataCatalog(normalized.data) as Record<string, unknown>,
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
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 4 }, sm: { h: 10, w: 4 } },
    title: "网易云音乐",
    type: "music.netease.overview"
  },
  {
    id: "00000000-0000-4000-8000-000000009202",
    schemaVersion: 1,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 5, w: 4 }, sm: { h: 7, w: 4 } },
    type: "music.netease.identity"
  },
  {
    id: "00000000-0000-4000-8000-000000009203",
    schemaVersion: 1,
    sizes: { lg: { h: 3, w: 4 }, md: { h: 3, w: 4 }, sm: { h: 4, w: 4 } },
    type: "music.netease.listening"
  },
  {
    dataConfig: { publicRanges: ["week", "month"] },
    id: "00000000-0000-4000-8000-000000009209",
    schemaVersion: 1,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 4 }, sm: { h: 7, w: 4 } },
    type: "music.netease.calendar"
  },
  {
    dataConfig: { publicLimit: 100, publicRanges: ["week", "all_time"] },
    id: "00000000-0000-4000-8000-000000009204",
    schemaVersion: 2,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 4 }, sm: { h: 7, w: 4 } },
    type: "music.netease.ranking"
  },
  {
    dataConfig: { publicLimit: 500 },
    id: "00000000-0000-4000-8000-000000009206",
    schemaVersion: 1,
    sizes: { lg: { h: 5, w: 6 }, md: { h: 5, w: 4 }, sm: { h: 8, w: 4 } },
    type: "music.netease.playlists"
  },
  {
    id: "00000000-0000-4000-8000-000000009207",
    schemaVersion: 2,
    sizes: { lg: { h: 6, w: 6 }, md: { h: 6, w: 4 }, sm: { h: 9, w: 4 } },
    type: "music.netease.showcase"
  }
] as const;

const localWidgetOrder = new Map([
  ["music.netease.overview", 0],
  ["music.netease.identity", 1],
  ["music.netease.listening", 2],
  ["music.netease.calendar", 3],
  ["music.netease.ranking", 4],
  ["music.netease.showcase", 5],
  ["music.netease.playlists", 6]
]);

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
  for (const definition of [...localNeteaseWidgets].sort(
    (left, right) =>
      (localWidgetOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER) -
      (localWidgetOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER)
  )) {
    const baseWidget = createMockWidget(definition.type, definition.id, definition.schemaVersion);
    const widget = {
      ...baseWidget,
      ...("dataConfig" in definition ? { dataConfig: definition.dataConfig } : {}),
      ...("title" in definition ? { title: definition.title } : {})
    } as WidgetProjection;
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
  const correlationId = state.normalized.meta.correlationId;
  if (!correlationId) throw new Error("Local normalized Provider state omitted correlationId.");
  const projectionInput = {
    data: { normalized: state.normalized, targets },
    meta: providerProtocolMetadata("projection.request", "netease", correlationId)
  } satisfies ProviderProjectionInput;
  assertProviderProjectionInput(projectionInput, NETEASE_PROVIDER_MANIFEST, correlationId);
  const projected = await new NeteaseProjector().project(projectionInput);
  assertProviderProjectionBatch(projected, NETEASE_PROVIDER_MANIFEST, correlationId);
  const built = projected.data;
  assertProviderProjectionSet(targets, built, state.normalized);
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
