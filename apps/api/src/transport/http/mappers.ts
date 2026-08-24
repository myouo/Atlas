import type { UpdateWidgetInput } from "@nivalis/application";
import type {
  DashboardDraftInput,
  DashboardLiveDataSnapshot,
  DashboardReadModelSnapshot,
  DashboardRevisionMetadata,
  DashboardRevisionSnapshot,
  DashboardSnapshot,
  JsonObject,
  ProviderAuthAttempt,
  ProviderConnectionView,
  ProviderStatus,
  SyncRun,
  WidgetConfiguration,
  WidgetPlacement,
  WidgetProjection
} from "@nivalis/domain";
import type { Static } from "typebox";

import type {
  CreateWidgetInputSchema,
  DashboardDraftUpdateSchema,
  DashboardLiveDataSchema,
  DashboardReadModelSchema,
  DashboardRevisionDetailSchema,
  DashboardRevisionMetadataSchema,
  DashboardStateSchema,
  ProviderConnectionSchema,
  ProviderAuthAttemptSchema,
  ProviderStatusSchema,
  SyncJobSchema,
  UpdateWidgetInputSchema,
  WidgetConfigurationSchema,
  WidgetProjectionSchema
} from "./schemas";

export type DashboardDraftUpdateBody = Static<typeof DashboardDraftUpdateSchema>;
export type CreateWidgetBody = Static<typeof CreateWidgetInputSchema>;
export type UpdateWidgetBody = Static<typeof UpdateWidgetInputSchema>;

export function serializeDashboard(
  dashboard: DashboardSnapshot
): Static<typeof DashboardStateSchema> {
  return {
    dashboardId: "about",
    layout: cloneLayout(dashboard.layout),
    profile: { ...dashboard.profile, tags: [...dashboard.profile.tags] },
    revision: dashboard.revision,
    revisionId: dashboard.revisionId,
    state: dashboard.state,
    updatedAt: dashboard.updatedAt.toISOString(),
    widgets: dashboard.widgets.map(serializeWidgetConfiguration)
  };
}

export function serializeRevisionMetadata(
  revision: DashboardRevisionMetadata
): Static<typeof DashboardRevisionMetadataSchema> {
  return {
    createdAt: revision.createdAt.toISOString(),
    isCurrentDraft: revision.isCurrentDraft,
    isCurrentPublished: revision.isCurrentPublished,
    operation: revision.operation,
    parentRevisionId: revision.parentRevisionId,
    restoredFromRevisionId: revision.restoredFromRevisionId,
    revisionId: revision.revisionId,
    revisionNumber: revision.revisionNumber
  };
}

export function serializeRevisionDetail(
  revision: DashboardRevisionSnapshot
): Static<typeof DashboardRevisionDetailSchema> {
  return {
    ...serializeRevisionMetadata(revision),
    dashboardId: revision.dashboardId,
    layout: cloneLayout(revision.layout),
    profile: { ...revision.profile, tags: [...revision.profile.tags] },
    widgets: revision.widgets.map(serializeWidgetConfiguration)
  };
}

export function serializePublicDashboard(
  dashboard: DashboardReadModelSnapshot
): Static<typeof DashboardReadModelSchema> {
  return {
    dashboardId: dashboard.dashboardId,
    layout: cloneLayout(dashboard.layout),
    profile: { ...dashboard.profile, tags: [...dashboard.profile.tags] },
    revision: dashboard.revision,
    widgets: dashboard.widgets.map(serializeWidgetProjection)
  };
}

export function serializeLiveData(
  snapshot: DashboardLiveDataSnapshot
): Static<typeof DashboardLiveDataSchema> {
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

export function serializeWidgetConfiguration(
  widget: WidgetConfiguration
): Static<typeof WidgetConfigurationSchema> {
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

export function serializeWidgetProjection(
  widget: WidgetProjection
): Static<typeof WidgetProjectionSchema> {
  return {
    dataConfig: widget.dataConfig,
    data: widget.data,
    enabled: widget.enabled,
    id: widget.id,
    presentationConfig: widget.presentationConfig,
    provider: widget.provider,
    schemaVersion: widget.schemaVersion,
    stale: widget.stale,
    title: widget.title,
    type: widget.type,
    updatedAt: widget.updatedAt.toISOString()
  } as Static<typeof WidgetProjectionSchema>;
}

export function deserializeDraftUpdate(body: DashboardDraftUpdateBody): DashboardDraftInput {
  return {
    layout: body.layout,
    widgets: body.widgets.map(deserializeWidget)
  };
}

export function deserializeWidget(
  widget: Static<typeof WidgetConfigurationSchema>
): WidgetConfiguration {
  return {
    dataConfig: widget.dataConfig as JsonObject,
    enabled: widget.enabled,
    id: widget.id,
    presentationConfig: widget.presentationConfig as JsonObject,
    provider: widget.provider,
    schemaVersion: widget.schemaVersion,
    title: widget.title,
    type: widget.type
  };
}

export function deserializePlacement(body: CreateWidgetBody): WidgetPlacement {
  return body.placement;
}

export function deserializeWidgetPatch(body: UpdateWidgetBody): UpdateWidgetInput {
  return {
    ...(body.dataConfig ? { dataConfig: body.dataConfig as JsonObject } : {}),
    ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    ...(body.presentationConfig
      ? { presentationConfig: body.presentationConfig as JsonObject }
      : {}),
    ...(body.title ? { title: body.title } : {})
  };
}

export function serializeProviderStatus(
  status: ProviderStatus
): Static<typeof ProviderStatusSchema> {
  return {
    connection: status.connection,
    attemptCount: status.attemptCount,
    credentialStatus: status.credentialStatus,
    lastAttemptAt: status.lastAttemptAt?.toISOString() ?? null,
    lastErrorCode: status.lastErrorCode,
    lastErrorMessage: status.lastErrorMessage,
    lastSuccessAt: status.lastSuccessAt?.toISOString() ?? null,
    provider: status.provider,
    syncStatus: status.syncStatus
  };
}

export function serializeProviderConnection(
  connection: ProviderConnectionView
): Static<typeof ProviderConnectionSchema> {
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

export function serializeProviderAuthAttempt(
  attempt: ProviderAuthAttempt
): Static<typeof ProviderAuthAttemptSchema> {
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

export function serializeSyncJob(run: SyncRun): Static<typeof SyncJobSchema> {
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

function cloneLayout(layout: DashboardSnapshot["layout"]) {
  return {
    lg: layout.lg.map((item) => ({ ...item })),
    md: layout.md.map((item) => ({ ...item })),
    sm: layout.sm.map((item) => ({ ...item }))
  };
}
