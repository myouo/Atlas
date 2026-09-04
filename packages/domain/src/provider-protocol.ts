import type { ProviderType } from "./dashboard";
import { ProviderProtocolError } from "./errors";
import type { JsonObject, JsonValue } from "./json";
import type { BuiltWidgetProjection, ProjectionTarget, RawSnapshot, SyncRun } from "./sync";

export const PROVIDER_DATA_PROTOCOL = "nivalis.provider-data" as const;
export const PROVIDER_DATA_PROTOCOL_VERSION = "2.0" as const;
export const PROVIDER_JSON_MEDIA_TYPE = "application/json" as const;
export const PROVIDER_BLOB_REFERENCE_MEDIA_TYPE =
  "application/vnd.nivalis.blob-reference+json" as const;

export type ProviderMessageKind =
  | "collection.request"
  | "collection.result"
  | "failure"
  | "manifest"
  | "normalization.request"
  | "normalization.result"
  | "projection.request"
  | "projection.result"
  | "snapshot.record"
  | "source.record";

export interface ProviderProtocolMetadata<TKind extends ProviderMessageKind> {
  /** SyncRun ID for an operation, and null for a static manifest. */
  readonly correlationId: string | null;
  /** Namespaced, JSON-safe forward-compatible metadata. */
  readonly extensions: JsonObject;
  readonly kind: TKind;
  readonly protocol: typeof PROVIDER_DATA_PROTOCOL;
  readonly protocolVersion: typeof PROVIDER_DATA_PROTOCOL_VERSION;
  readonly provider: ProviderType;
}

/** Every Provider message has exactly one payload and one metadata object. */
export interface ProviderDataEnvelope<
  TKind extends ProviderMessageKind,
  TData,
  TMeta extends object = Record<never, never>
> {
  readonly data: TData;
  readonly meta: ProviderProtocolMetadata<TKind> & TMeta;
}

export function providerProtocolMetadata<TKind extends ProviderMessageKind>(
  kind: TKind,
  provider: ProviderType,
  correlationId: string | null = null,
  extensions: JsonObject = {}
): ProviderProtocolMetadata<TKind> {
  return {
    correlationId,
    extensions,
    kind,
    protocol: PROVIDER_DATA_PROTOCOL,
    protocolVersion: PROVIDER_DATA_PROTOCOL_VERSION,
    provider
  };
}

/** Typed construction helper for adapters; core metadata always wins over extension metadata. */
export function providerDataEnvelope<
  TKind extends ProviderMessageKind,
  TData,
  TMeta extends object = Record<never, never>
>(
  kind: TKind,
  provider: ProviderType,
  correlationId: string | null,
  data: TData,
  metadata: TMeta,
  extensions: JsonObject = {}
): ProviderDataEnvelope<TKind, TData, TMeta> {
  return {
    data,
    meta: Object.assign(
      {},
      metadata,
      providerProtocolMetadata(kind, provider, correlationId, extensions)
    )
  };
}

export type ProviderCollectionMode = "incremental" | "snapshot";
export type ProviderCollectionOutcome = "complete" | "partial";
export type ProviderDataShape =
  "collection" | "document" | "graph" | "media" | "mixed" | "scalar" | "time_series";
export type ProviderPartitionKind = "cursor" | "index" | "key" | "singleton" | "time_window";
export type ProviderPayloadKind = "blob_reference" | "json";
export type ProviderRecordOperation = "delete" | "replace" | "upsert";

export interface ProviderSchemaSupport {
  /** Historical versions the current adapter can still read and replay. */
  readonly acceptedVersions: readonly number[];
  /** Stable URI/URN identifying semantics independently from its version. */
  readonly id: string;
  /** Version emitted by new collection/normalization operations. */
  readonly producedVersion: number;
}

export interface ProviderSourceDefinition {
  readonly criticality: "optional" | "required";
  readonly dataShape: ProviderDataShape;
  readonly extensions: JsonObject;
  readonly id: string;
  readonly mediaTypes: readonly string[];
  readonly operations: readonly ProviderRecordOperation[];
  readonly partitions: readonly ProviderPartitionKind[];
  readonly payloadKinds: readonly ProviderPayloadKind[];
  readonly schema: ProviderSchemaSupport;
}

export interface ProviderManifestData {
  readonly capabilities: {
    readonly collectionModes: readonly ProviderCollectionMode[];
    readonly continuation: boolean;
    readonly partialResults: boolean;
    readonly payloadKinds: readonly ProviderPayloadKind[];
  };
  readonly displayName: string;
  readonly extensions: JsonObject;
  readonly limits: {
    readonly maxBatchBytes: number;
    readonly maxBatchRecords: number;
    readonly maxCacheRecords: number;
    readonly maxCheckpointBytes: number;
    readonly maxCollectionBytes: number;
    readonly maxContinuationBatches: number;
    readonly maxIssues: number;
    readonly maxNormalizedBytes: number;
    readonly maxProjectionBytes: number;
    readonly maxRecordBytes: number;
  };
  readonly normalizedSchema: ProviderSchemaSupport;
  readonly sources: readonly ProviderSourceDefinition[];
}

export type ProviderRuntimeManifest = ProviderDataEnvelope<"manifest", ProviderManifestData>;

export type ProviderPartition =
  | { readonly kind: "singleton" }
  | { readonly index: number; readonly kind: "index" }
  | { readonly cursor: string | null; readonly index: number; readonly kind: "cursor" }
  | { readonly key: string; readonly kind: "key" }
  | { readonly end: string; readonly kind: "time_window"; readonly start: string };

/** Binary content lives in ObjectStorage; Provider messages carry only this immutable reference. */
export interface ProviderBlobReference extends JsonObject {
  readonly byteLength: number;
  readonly fileName: string | null;
  readonly kind: "blob_reference";
  readonly mediaType: string;
  readonly sha256: string;
  readonly storageKey: string;
}

export interface ProviderIssue {
  readonly code: string;
  readonly message: string;
  readonly partition: ProviderPartition | null;
  readonly retryable: boolean;
  readonly severity: "error" | "warning";
  readonly source: string | null;
}

export interface ProviderSourceMetadata {
  readonly collectedAt: string;
  readonly mediaType: string;
  readonly operation: ProviderRecordOperation;
  readonly partition: ProviderPartition;
  readonly payloadKind: ProviderPayloadKind;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly source: string;
  readonly sourceUpdatedAt: string | null;
}

export type ProviderSourceRecord = ProviderDataEnvelope<
  "source.record",
  JsonValue,
  ProviderSourceMetadata
>;

export interface ProviderSyncRequestData {
  readonly attempt: number;
  readonly cachedRecords: readonly ProviderSourceRecord[];
  readonly checkpoint: JsonObject | null;
  readonly connectionId: string;
  readonly continuation: string | null;
  readonly requestedAt: string;
  readonly runId: string;
}

export type ProviderSyncRequest = ProviderDataEnvelope<
  "collection.request",
  ProviderSyncRequestData
>;

export interface ProviderCollectionData {
  readonly checkpoint: JsonObject | null;
  readonly continuation: string | null;
  readonly issues: readonly ProviderIssue[];
  readonly mode: ProviderCollectionMode;
  readonly outcome: ProviderCollectionOutcome;
  readonly records: readonly ProviderSourceRecord[];
}

export type ProviderCollection = ProviderDataEnvelope<"collection.result", ProviderCollectionData>;

export interface ProviderSnapshotMetadata extends ProviderSourceMetadata {
  readonly checkpoint: JsonObject | null;
  readonly collectionMode: ProviderCollectionMode;
  readonly collectionOutcome: ProviderCollectionOutcome;
  readonly connectionId: string;
  readonly issues: readonly ProviderIssue[];
  readonly payloadHash: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly storedAt: string;
}

export type ProviderSnapshotRecord = ProviderDataEnvelope<
  "snapshot.record",
  JsonValue,
  ProviderSnapshotMetadata
>;

export interface ProviderNormalizationInputData {
  readonly checkpoint: JsonObject | null;
  readonly collectionMode: ProviderCollectionMode;
  readonly collectionOutcome: ProviderCollectionOutcome;
  readonly issues: readonly ProviderIssue[];
  /** Required by incremental adapters; null for the first/full snapshot. */
  readonly previous: NormalizedProviderData | null;
  readonly records: readonly ProviderSnapshotRecord[];
}

export type ProviderNormalizationInput = ProviderDataEnvelope<
  "normalization.request",
  ProviderNormalizationInputData
>;

export interface ProviderSourceSnapshotReference {
  readonly partition: ProviderPartition;
  readonly snapshotId: string;
  readonly source: string;
}

export interface ProviderNormalizedMetadata {
  readonly checkpoint: JsonObject | null;
  readonly issues: readonly ProviderIssue[];
  readonly outcome: ProviderCollectionOutcome;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly sourceSnapshots: readonly ProviderSourceSnapshotReference[];
}

export type NormalizedProviderData = ProviderDataEnvelope<
  "normalization.result",
  JsonObject,
  ProviderNormalizedMetadata
>;

export interface ProviderProjectionInputData {
  readonly normalized: NormalizedProviderData;
  readonly targets: readonly ProjectionTarget[];
}

export type ProviderProjectionInput = ProviderDataEnvelope<
  "projection.request",
  ProviderProjectionInputData
>;

export interface ProviderProjectionMetadata {
  readonly issues: readonly ProviderIssue[];
  readonly outcome: ProviderCollectionOutcome;
}

export type ProviderProjectionBatch = ProviderDataEnvelope<
  "projection.result",
  readonly BuiltWidgetProjection[],
  ProviderProjectionMetadata
>;

export type ProviderFailureCategory =
  | "configuration"
  | "credential"
  | "normalization"
  | "permanent"
  | "projection"
  | "protocol"
  | "rate_limit"
  | "schema"
  | "transport";

export interface ProviderFailureData {
  readonly category: ProviderFailureCategory;
  readonly code: string;
  readonly credentialStatus: "expired" | "invalid" | null;
  readonly message: string;
  readonly partition: ProviderPartition | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly source: string | null;
}

export type ProviderFailure = ProviderDataEnvelope<"failure", ProviderFailureData>;
export type ProviderCollectionResult = ProviderCollection | ProviderFailure;
export type ProviderNormalizationResult = NormalizedProviderData | ProviderFailure;
export type ProviderProjectionResult = ProviderProjectionBatch | ProviderFailure;

export interface ProviderConnector {
  collect(request: ProviderSyncRequest): Promise<ProviderCollectionResult>;
}

export interface ProviderNormalizer {
  normalize(input: ProviderNormalizationInput): Promise<ProviderNormalizationResult>;
}

export interface ProviderProjector {
  project(input: ProviderProjectionInput): Promise<ProviderProjectionResult>;
}

export interface ProviderRuntimeModule {
  readonly connector: ProviderConnector;
  readonly manifest: ProviderRuntimeManifest;
  readonly normalizer: ProviderNormalizer;
  readonly projector: ProviderProjector;
}

export function providerSupportsCollectionMode(
  manifest: ProviderRuntimeManifest,
  mode: ProviderCollectionMode
): boolean {
  return manifest.data.capabilities.collectionModes.includes(mode);
}

/** Carry prior lineage forward and replace it by canonical source/partition identity. */
export function materializeProviderLineage(
  input: ProviderNormalizationInput
): readonly ProviderSourceSnapshotReference[] {
  const lineage = new Map<string, ProviderSourceSnapshotReference>();
  for (const reference of input.data.previous?.meta.sourceSnapshots ?? []) {
    lineage.set(providerSourcePartitionIdentity(reference.source, reference.partition), reference);
  }
  for (const snapshot of input.data.records) {
    const reference: ProviderSourceSnapshotReference = {
      partition: snapshot.meta.partition,
      snapshotId: snapshot.meta.snapshotId,
      source: snapshot.meta.source
    };
    lineage.set(providerSourcePartitionIdentity(reference.source, reference.partition), reference);
  }
  return [...lineage.values()];
}

export function providerSourceSchemaId(provider: ProviderType, source: string): string {
  return `urn:nivalis:provider:${provider}:source:${source}`;
}

export function providerNormalizedSchemaId(provider: ProviderType): string {
  return `urn:nivalis:provider:${provider}:normalized`;
}

export function providerSourcePartitionIdentity(
  source: string,
  partition: ProviderPartition
): string {
  switch (partition.kind) {
    case "singleton":
      return `${source}\u0000singleton`;
    case "index":
      return `${source}\u0000index:${partition.index}`;
    case "cursor":
      return `${source}\u0000cursor:${partition.index}`;
    case "key":
      return `${source}\u0000key:${JSON.stringify(partition.key)}`;
    case "time_window":
      return `${source}\u0000time_window:${partition.start}:${partition.end}`;
  }
}

export function toProviderSyncRequest(
  run: SyncRun,
  options: {
    readonly cachedRecords?: readonly ProviderSourceRecord[];
    readonly checkpoint?: JsonObject | null;
    readonly continuation?: string | null;
  } = {}
): ProviderSyncRequest {
  return {
    data: {
      attempt: run.attemptCount,
      cachedRecords: options.cachedRecords ?? [],
      checkpoint: options.checkpoint ?? null,
      connectionId: run.providerConnectionId,
      continuation: options.continuation ?? null,
      requestedAt: run.requestedAt.toISOString(),
      runId: run.id
    },
    meta: providerProtocolMetadata("collection.request", run.provider, run.id)
  };
}

const STORED_SOURCE_CONTEXT_PREFIX = "nivalis.provider-data/2:";

interface StoredSourceContext {
  readonly checkpoint: JsonObject | null;
  readonly collectionMode: ProviderCollectionMode;
  readonly collectionOutcome: ProviderCollectionOutcome;
  readonly extensions: JsonObject;
  readonly issues: readonly ProviderIssue[];
  readonly mediaType: string;
  readonly operation: ProviderRecordOperation;
  readonly partition: ProviderPartition;
  readonly payloadKind: ProviderPayloadKind;
  readonly schemaId: string;
}

export function encodeProviderSourceContext(
  record: ProviderSourceRecord,
  collection: Pick<ProviderCollectionData, "checkpoint" | "issues" | "mode" | "outcome">
): string {
  return `${STORED_SOURCE_CONTEXT_PREFIX}${JSON.stringify({
    checkpoint: collection.checkpoint,
    collectionMode: collection.mode,
    collectionOutcome: collection.outcome,
    extensions: record.meta.extensions,
    issues: collection.issues,
    mediaType: record.meta.mediaType,
    operation: record.meta.operation,
    partition: record.meta.partition,
    payloadKind: record.meta.payloadKind,
    schemaId: record.meta.schemaId
  } satisfies StoredSourceContext)}`;
}

export function toProviderSourceRecord(
  snapshot: RawSnapshot,
  correlationId: string | null = null
): ProviderSourceRecord {
  const context = decodeProviderSourceContext(snapshot);
  return {
    data: snapshot.payload,
    meta: {
      ...providerProtocolMetadata(
        "source.record",
        snapshot.provider,
        correlationId,
        context.extensions
      ),
      collectedAt: snapshot.fetchedAt.toISOString(),
      mediaType: context.mediaType,
      operation: context.operation,
      partition: context.partition,
      payloadKind: context.payloadKind,
      schemaId: context.schemaId,
      schemaVersion: snapshot.schemaVersion,
      source: context.source,
      sourceUpdatedAt: snapshot.sourceTimestamp?.toISOString() ?? null
    }
  };
}

export function toProviderSnapshotRecord(snapshot: RawSnapshot): ProviderSnapshotRecord {
  const context = decodeProviderSourceContext(snapshot);
  const source = toProviderSourceRecord(snapshot, snapshot.syncRunId);
  return {
    data: source.data,
    meta: {
      ...providerProtocolMetadata(
        "snapshot.record",
        snapshot.provider,
        snapshot.syncRunId,
        context.extensions
      ),
      checkpoint: context.checkpoint,
      collectedAt: source.meta.collectedAt,
      collectionMode: context.collectionMode,
      collectionOutcome: context.collectionOutcome,
      connectionId: snapshot.providerConnectionId,
      issues: context.issues,
      mediaType: source.meta.mediaType,
      operation: source.meta.operation,
      partition: source.meta.partition,
      payloadHash: snapshot.payloadHash,
      payloadKind: source.meta.payloadKind,
      runId: snapshot.syncRunId,
      schemaId: source.meta.schemaId,
      schemaVersion: snapshot.schemaVersion,
      snapshotId: snapshot.id,
      source: source.meta.source,
      sourceUpdatedAt: source.meta.sourceUpdatedAt,
      storedAt: snapshot.createdAt.toISOString()
    }
  };
}

function decodeProviderSourceContext(snapshot: RawSnapshot): StoredSourceContext & {
  readonly source: string;
} {
  if (snapshot.sourceCursor?.startsWith(STORED_SOURCE_CONTEXT_PREFIX)) {
    try {
      const value: unknown = JSON.parse(
        snapshot.sourceCursor.slice(STORED_SOURCE_CONTEXT_PREFIX.length)
      );
      if (isStoredSourceContext(value)) return { ...value, source: snapshot.sourceKind };
    } catch (error) {
      if (error instanceof ProviderProtocolError) throw error;
    }
    throw new ProviderProtocolError("Stored Provider source context is invalid.");
  }

  const legacy = legacySourcePartition(snapshot.sourceKind, snapshot.sourceCursor);
  return {
    checkpoint: null,
    collectionMode: "snapshot",
    collectionOutcome: "complete",
    extensions: {},
    issues: [],
    mediaType: PROVIDER_JSON_MEDIA_TYPE,
    operation: "replace",
    partition: legacy.partition,
    payloadKind: "json",
    schemaId: providerSourceSchemaId(snapshot.provider, legacy.source),
    source: legacy.source
  };
}

function legacySourcePartition(
  source: string,
  cursor: string | null
): { readonly partition: ProviderPartition; readonly source: string } {
  const match = source.match(/^(.*)\.(page|period)\.([0-9]+)$/);
  if (match) {
    return {
      partition: { index: Number(match[3]), kind: "index" },
      source: match[1]!
    };
  }
  if (cursor) return { partition: { cursor, index: 0, kind: "cursor" }, source };
  return { partition: { kind: "singleton" }, source };
}

function isStoredSourceContext(value: unknown): value is StoredSourceContext {
  if (!isObject(value)) return false;
  return (
    (value.checkpoint === null || isObject(value.checkpoint)) &&
    ["incremental", "snapshot"].includes(String(value.collectionMode)) &&
    ["complete", "partial"].includes(String(value.collectionOutcome)) &&
    isObject(value.extensions) &&
    Array.isArray(value.issues) &&
    typeof value.mediaType === "string" &&
    ["delete", "replace", "upsert"].includes(String(value.operation)) &&
    ["blob_reference", "json"].includes(String(value.payloadKind)) &&
    typeof value.schemaId === "string" &&
    isProviderPartition(value.partition)
  );
}

function isProviderPartition(value: unknown): value is ProviderPartition {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "singleton":
      return true;
    case "index":
      return typeof value.index === "number" && Number.isSafeInteger(value.index);
    case "cursor":
      return (
        typeof value.index === "number" &&
        Number.isSafeInteger(value.index) &&
        (value.cursor === null || typeof value.cursor === "string")
      );
    case "key":
      return typeof value.key === "string";
    case "time_window":
      return typeof value.start === "string" && typeof value.end === "string";
    default:
      return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
