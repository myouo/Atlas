import {
  NormalizationError,
  PermanentProviderError,
  ProjectionError,
  PROVIDER_BLOB_REFERENCE_MEDIA_TYPE,
  PROVIDER_DATA_PROTOCOL,
  PROVIDER_DATA_PROTOCOL_VERSION,
  ProviderCredentialError,
  ProviderProtocolError,
  ProviderSchemaMismatchError,
  providerSourcePartitionIdentity,
  RawSnapshotSanitizationError,
  RetryableProviderError
} from "@nivalis/domain";
import type {
  BuiltWidgetProjection,
  JsonObject,
  JsonValue,
  NormalizedProviderData,
  ProjectionTarget,
  ProviderBlobReference,
  ProviderCollection,
  ProviderDataShape,
  ProviderFailure,
  ProviderIssue,
  ProviderMessageKind,
  ProviderNormalizationInput,
  ProviderPartition,
  ProviderPartitionKind,
  ProviderPayloadKind,
  ProviderProjectionBatch,
  ProviderProjectionInput,
  ProviderRecordOperation,
  ProviderRuntimeManifest,
  ProviderSchemaSupport,
  ProviderSnapshotRecord,
  ProviderSourceDefinition,
  ProviderSourceRecord,
  ProviderSyncRequest,
  ProviderType
} from "@nivalis/domain";

const SOURCE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SCHEMA_ID_PATTERN = /^(?:https:\/\/|urn:)[^\s]{3,300}$/;
const MEDIA_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const CREDENTIAL_MARKER =
  /(?:authorization|cookie|music[_-]?u|csrf|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\s*[:=]/i;

const COLLECTION_MODES = ["incremental", "snapshot"] as const;
const DATA_SHAPES: readonly ProviderDataShape[] = [
  "collection",
  "document",
  "graph",
  "media",
  "mixed",
  "scalar",
  "time_series"
];
const PARTITION_KINDS: readonly ProviderPartitionKind[] = [
  "cursor",
  "index",
  "key",
  "singleton",
  "time_window"
];
const PAYLOAD_KINDS: readonly ProviderPayloadKind[] = ["blob_reference", "json"];
const RECORD_OPERATIONS: readonly ProviderRecordOperation[] = ["delete", "replace", "upsert"];

export const PROVIDER_HOST_LIMITS = {
  maxBatchBytes: 16_000_000,
  maxBatchRecords: 1_024,
  maxCacheRecords: 128,
  maxCheckpointBytes: 65_536,
  maxCollectionBytes: 32_000_000,
  maxContinuationBatches: 128,
  maxIssues: 256,
  maxNormalizedBytes: 16_000_000,
  maxProjectionBytes: 16_000_000,
  maxRecordBytes: 8_000_000
} as const;
export const PROVIDER_HOST_MAX_MANIFEST_BYTES = 1_000_000;
export const PROVIDER_HOST_MAX_EXTENSION_BYTES = 65_536;
const PROVIDER_LIMIT_KEYS = [
  "maxBatchBytes",
  "maxBatchRecords",
  "maxCacheRecords",
  "maxCheckpointBytes",
  "maxCollectionBytes",
  "maxContinuationBatches",
  "maxIssues",
  "maxNormalizedBytes",
  "maxProjectionBytes",
  "maxRecordBytes"
] as const;

export function assertProviderManifest(
  manifest: ProviderRuntimeManifest,
  expectedProvider: ProviderType
): void {
  assertEnvelope(manifest, "manifest");
  assertProtocolMetadata(manifest.meta, expectedProvider, "manifest", "manifest", null);
  if (!isObject(manifest.data)) throw protocolError("manifest data must be an object");
  assertOnlyKeys(
    manifest.data,
    ["capabilities", "displayName", "extensions", "limits", "normalizedSchema", "sources"],
    "manifest data"
  );
  const { capabilities, displayName, extensions, limits, normalizedSchema, sources } =
    manifest.data;
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 120) {
    throw protocolError("manifest displayName must be a non-empty bounded string");
  }
  assertExtensions(extensions, "manifest data extensions");
  if (!isObject(capabilities)) throw protocolError("manifest capabilities must be an object");
  assertOnlyKeys(
    capabilities,
    ["collectionModes", "continuation", "partialResults", "payloadKinds"],
    "manifest capabilities"
  );
  assertUniqueEnumValues(
    capabilities.collectionModes,
    COLLECTION_MODES,
    "manifest collectionModes"
  );
  assertUniqueEnumValues(capabilities.payloadKinds, PAYLOAD_KINDS, "manifest payloadKinds");
  if (
    typeof capabilities.continuation !== "boolean" ||
    typeof capabilities.partialResults !== "boolean"
  ) {
    throw protocolError("manifest capability flags must be booleans");
  }
  if (!isObject(limits)) throw protocolError("manifest limits must be an object");
  assertOnlyKeys(
    limits,
    [
      "maxBatchBytes",
      "maxBatchRecords",
      "maxCacheRecords",
      "maxCheckpointBytes",
      "maxCollectionBytes",
      "maxContinuationBatches",
      "maxIssues",
      "maxNormalizedBytes",
      "maxProjectionBytes",
      "maxRecordBytes"
    ],
    "manifest limits"
  );
  assertPositiveInteger(limits.maxBatchBytes, "maxBatchBytes");
  assertPositiveInteger(limits.maxBatchRecords, "maxBatchRecords");
  assertNonNegativeInteger(limits.maxCacheRecords, "maxCacheRecords");
  assertPositiveInteger(limits.maxCheckpointBytes, "maxCheckpointBytes");
  assertPositiveInteger(limits.maxCollectionBytes, "maxCollectionBytes");
  assertPositiveInteger(limits.maxContinuationBatches, "maxContinuationBatches");
  assertNonNegativeInteger(limits.maxIssues, "maxIssues");
  assertPositiveInteger(limits.maxNormalizedBytes, "maxNormalizedBytes");
  assertPositiveInteger(limits.maxProjectionBytes, "maxProjectionBytes");
  assertPositiveInteger(limits.maxRecordBytes, "maxRecordBytes");
  if (limits.maxRecordBytes > limits.maxBatchBytes) {
    throw protocolError("maxRecordBytes cannot exceed maxBatchBytes");
  }
  if (limits.maxBatchBytes > limits.maxCollectionBytes) {
    throw protocolError("maxBatchBytes cannot exceed maxCollectionBytes");
  }
  for (const key of PROVIDER_LIMIT_KEYS) {
    if (limits[key] > PROVIDER_HOST_LIMITS[key]) {
      throw protocolError(`manifest ${key} exceeds the Nivalis host limit`);
    }
  }
  if (!capabilities.continuation && limits.maxContinuationBatches !== 1) {
    throw protocolError("non-continuation runtimes must declare one continuation batch");
  }
  assertSchemaSupport(normalizedSchema, "normalized schema");
  if (!Array.isArray(sources) || sources.length < 1) {
    throw protocolError("manifest must declare at least one source");
  }
  const sourceIds = new Set<string>();
  const schemaIds = new Set<string>();
  for (const definition of sources) {
    assertSourceDefinition(definition, expectedProvider, capabilities.payloadKinds);
    if (sourceIds.has(definition.id)) {
      throw protocolError("manifest source identifiers must be unique");
    }
    if (schemaIds.has(definition.schema.id)) {
      throw protocolError("manifest source schema identifiers must be unique");
    }
    sourceIds.add(definition.id);
    schemaIds.add(definition.schema.id);
  }
  assertByteLimit(manifest, PROVIDER_HOST_MAX_MANIFEST_BYTES, "manifest");
}

export function assertProviderSyncRequest(
  request: ProviderSyncRequest,
  manifest: ProviderRuntimeManifest
): void {
  assertEnvelope(request, "collection request");
  if (!isObject(request.data)) throw protocolError("collection request data must be an object");
  assertOnlyKeys(
    request.data,
    [
      "attempt",
      "cachedRecords",
      "checkpoint",
      "connectionId",
      "continuation",
      "requestedAt",
      "runId"
    ],
    "collection request data"
  );
  const { attempt, cachedRecords, checkpoint, connectionId, continuation, requestedAt, runId } =
    request.data;
  assertProtocolMetadata(
    request.meta,
    manifest.meta.provider,
    "collection request",
    "collection.request",
    runId
  );
  assertNonNegativeInteger(attempt, "collection attempt");
  assertNonEmptyString(connectionId, 200, "connectionId");
  assertNonEmptyString(runId, 200, "runId");
  if (!isCanonicalTimestamp(requestedAt)) {
    throw protocolError("requestedAt must be a canonical RFC 3339 UTC timestamp");
  }
  assertContinuation(continuation, manifest, "collection request continuation");
  assertCheckpoint(checkpoint, "collection request checkpoint");
  assertCheckpointSize(checkpoint, manifest);
  if (
    !Array.isArray(cachedRecords) ||
    cachedRecords.length > manifest.data.limits.maxCacheRecords
  ) {
    throw protocolError("cachedRecords exceeds the manifest limit");
  }
  for (const record of cachedRecords) {
    validateSourceRecord(record, manifest, false, undefined);
    assertByteLimit(record, manifest.data.limits.maxRecordBytes, "cached record");
  }
  if (jsonByteLength(cachedRecords) > manifest.data.limits.maxBatchBytes) {
    throw protocolError("cachedRecords exceeds the manifest byte limit");
  }
  assertByteLimit(request, manifest.data.limits.maxBatchBytes, "collection request");
}

export function assertProviderCollection(
  collection: ProviderCollection,
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId: string | null,
  enforceRequiredSources = true
): void {
  assertEnvelope(collection, "collection result");
  if (!isObject(collection.data)) throw protocolError("collection result data must be an object");
  assertOnlyKeys(
    collection.data,
    ["checkpoint", "continuation", "issues", "mode", "outcome", "records"],
    "collection result data"
  );
  assertProtocolMetadata(
    collection.meta,
    manifest.meta.provider,
    "collection result",
    "collection.result",
    expectedCorrelationId
  );
  const { checkpoint, continuation, issues, mode, outcome, records } = collection.data;
  if (!manifest.data.capabilities.collectionModes.includes(mode)) {
    throw protocolError("collection mode is not declared by the manifest");
  }
  if (outcome !== "complete" && outcome !== "partial") {
    throw protocolError("collection outcome is invalid");
  }
  if (outcome === "partial" && !manifest.data.capabilities.partialResults) {
    throw protocolError("runtime emitted a partial result without declaring support");
  }
  assertContinuation(continuation, manifest, "collection result continuation");
  assertCheckpoint(checkpoint, "collection result checkpoint");
  assertCheckpointSize(checkpoint, manifest);
  assertIssues(issues, manifest);
  if (issues.length > manifest.data.limits.maxIssues) {
    throw protocolError("collection issues exceeds the manifest limit");
  }
  if (outcome === "partial" && issues.length === 0) {
    throw protocolError("partial collections must explain their missing or degraded sources");
  }
  if (!Array.isArray(records) || records.length > manifest.data.limits.maxBatchRecords) {
    throw protocolError("collection records exceeds the manifest batch limit");
  }
  const identities = new Set<string>();
  for (const record of records) {
    validateSourceRecord(record, manifest, true, expectedCorrelationId);
    assertByteLimit(record, manifest.data.limits.maxRecordBytes, "source record");
    if (mode === "snapshot" && record.meta.operation !== "replace") {
      throw protocolError("snapshot collections may emit only replace records");
    }
    if (mode === "incremental" && record.meta.operation === "replace") {
      throw protocolError("incremental collections must use upsert or delete records");
    }
    const identity = providerRecordIdentity(record.meta.source, record.meta.partition);
    if (identities.has(identity)) {
      throw protocolError("collection contains a duplicate source/partition identity");
    }
    identities.add(identity);
  }
  assertByteLimit(collection, manifest.data.limits.maxBatchBytes, "collection batch");
  if (enforceRequiredSources && continuation === null) {
    assertProviderRecordSet(records, manifest, outcome, mode);
  }
}

export function assertProviderRecordSet(
  records: readonly ProviderSourceRecord[],
  manifest: ProviderRuntimeManifest,
  outcome: "complete" | "partial",
  mode: "incremental" | "snapshot"
): void {
  const identities = new Set<string>();
  for (const record of records) {
    const identity = providerRecordIdentity(record.meta.source, record.meta.partition);
    if (identities.has(identity)) {
      throw protocolError("collection batches contain a duplicate source/partition identity");
    }
    identities.add(identity);
  }
  if (outcome !== "complete" || mode === "incremental") return;
  for (const source of manifest.data.sources) {
    if (
      source.criticality === "required" &&
      !records.some((record) => record.meta.source === source.id)
    ) {
      throw protocolError(`complete collection omitted required source '${source.id}'`);
    }
  }
}

export function assertProviderSnapshotRecords(
  snapshots: readonly ProviderSnapshotRecord[],
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId?: string,
  allowEmpty = false
): void {
  if (!Array.isArray(snapshots) || (!allowEmpty && snapshots.length < 1)) {
    throw protocolError("normalization requires at least one Raw Snapshot record");
  }
  const identities = new Set<string>();
  const snapshotIds = new Set<string>();
  let collectionContext: string | null = null;
  for (const snapshot of snapshots) {
    assertEnvelope(snapshot, "Raw Snapshot record");
    assertProtocolMetadata(
      snapshot.meta,
      manifest.meta.provider,
      "Raw Snapshot record",
      "snapshot.record",
      expectedCorrelationId
    );
    const definition = validateSourceMetadata(snapshot.meta, manifest, false);
    if (!isJsonValue(snapshot.data)) {
      throw protocolError("Raw Snapshot data must be JSON-compatible");
    }
    assertSafeProviderData(snapshot.data, "Raw Snapshot data");
    validateDataShape(snapshot.data, definition.dataShape, snapshot.meta.operation);
    if (snapshot.meta.payloadKind === "blob_reference") {
      validateBlobReference(snapshot.data);
    }
    if (!manifest.data.capabilities.collectionModes.includes(snapshot.meta.collectionMode)) {
      throw protocolError("snapshot collectionMode is not declared by the manifest");
    }
    if (
      snapshot.meta.collectionOutcome !== "complete" &&
      snapshot.meta.collectionOutcome !== "partial"
    ) {
      throw protocolError("snapshot collectionOutcome is invalid");
    }
    if (
      snapshot.meta.collectionOutcome === "partial" &&
      !manifest.data.capabilities.partialResults
    ) {
      throw protocolError("snapshot uses partial outcome without manifest support");
    }
    assertCheckpoint(snapshot.meta.checkpoint, "snapshot checkpoint");
    assertCheckpointSize(snapshot.meta.checkpoint, manifest);
    assertIssues(snapshot.meta.issues, manifest);
    if (snapshot.meta.issues.length > manifest.data.limits.maxIssues) {
      throw protocolError("snapshot issues exceeds the manifest limit");
    }
    if (snapshot.meta.collectionMode === "snapshot" && snapshot.meta.operation !== "replace") {
      throw protocolError("snapshot-mode evidence may contain only replace operations");
    }
    if (snapshot.meta.collectionMode === "incremental" && snapshot.meta.operation === "replace") {
      throw protocolError("incremental evidence must use upsert or delete operations");
    }
    assertNonEmptyString(snapshot.meta.connectionId, 200, "snapshot connectionId");
    assertNonEmptyString(snapshot.meta.runId, 200, "snapshot runId");
    assertNonEmptyString(snapshot.meta.snapshotId, 200, "snapshotId");
    if (!/^[a-f0-9]{64}$/.test(snapshot.meta.payloadHash)) {
      throw protocolError("snapshot payloadHash must be lower-case SHA-256");
    }
    if (!isCanonicalTimestamp(snapshot.meta.storedAt)) {
      throw protocolError("snapshot storedAt must be a canonical RFC 3339 UTC timestamp");
    }
    if (snapshot.meta.correlationId !== snapshot.meta.runId) {
      throw protocolError("snapshot correlationId must equal runId");
    }
    const currentContext = [
      snapshot.meta.checkpoint === null ? "null" : canonicalJson(snapshot.meta.checkpoint),
      snapshot.meta.collectionMode,
      snapshot.meta.collectionOutcome,
      snapshot.meta.connectionId,
      JSON.stringify(snapshot.meta.issues),
      snapshot.meta.runId
    ].join("\u0000");
    if (collectionContext !== null && currentContext !== collectionContext) {
      throw protocolError("Raw Snapshots disagree on collection context");
    }
    collectionContext = currentContext;
    const identity = providerRecordIdentity(snapshot.meta.source, snapshot.meta.partition);
    if (identities.has(identity)) {
      throw protocolError("Raw Snapshots contain a duplicate source/partition identity");
    }
    if (snapshotIds.has(snapshot.meta.snapshotId)) {
      throw protocolError("Raw Snapshot IDs must be unique within a normalization input");
    }
    identities.add(identity);
    snapshotIds.add(snapshot.meta.snapshotId);
  }
}

export function assertProviderNormalizationInput(
  input: ProviderNormalizationInput,
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId: string
): void {
  assertEnvelope(input, "normalization request");
  if (!isObject(input.data)) throw protocolError("normalization request data must be an object");
  assertOnlyKeys(
    input.data,
    ["checkpoint", "collectionMode", "collectionOutcome", "issues", "previous", "records"],
    "normalization request data"
  );
  assertProtocolMetadata(
    input.meta,
    manifest.meta.provider,
    "normalization request",
    "normalization.request",
    expectedCorrelationId
  );
  if (!manifest.data.capabilities.collectionModes.includes(input.data.collectionMode)) {
    throw protocolError("normalization collectionMode is not declared by the manifest");
  }
  if (input.data.collectionOutcome !== "complete" && input.data.collectionOutcome !== "partial") {
    throw protocolError("normalization collectionOutcome is invalid");
  }
  assertCheckpoint(input.data.checkpoint, "normalization checkpoint");
  assertCheckpointSize(input.data.checkpoint, manifest);
  assertIssues(input.data.issues, manifest);
  if (input.data.issues.length > manifest.data.limits.maxIssues) {
    throw protocolError("normalization issues exceeds the manifest limit");
  }
  if (input.data.previous !== null) {
    assertCompatibleNormalizedData(input.data.previous, manifest);
  }
  if (input.data.collectionMode === "snapshot" && input.data.previous !== null) {
    throw protocolError("snapshot normalization must not depend on previous state");
  }
  const allowEmpty = input.data.collectionMode === "incremental" && input.data.previous !== null;
  assertProviderSnapshotRecords(input.data.records, manifest, expectedCorrelationId, allowEmpty);
  if (input.data.records.length > 0) {
    const first = input.data.records[0]!.meta;
    if (
      input.data.collectionMode !== first.collectionMode ||
      input.data.collectionOutcome !== first.collectionOutcome ||
      canonicalNullableJson(input.data.checkpoint) !== canonicalNullableJson(first.checkpoint) ||
      JSON.stringify(input.data.issues) !== JSON.stringify(first.issues)
    ) {
      throw protocolError("normalization request does not match persisted collection context");
    }
  }
}

export function assertCompatibleNormalizedData(
  value: unknown,
  manifest: ProviderRuntimeManifest
): asserts value is NormalizedProviderData {
  assertEnvelope(value, "stored normalized data");
  if (!isObject(value)) throw protocolError("stored normalized data must be an object");
  const data = value.data;
  const metadata = value.meta;
  assertProtocolMetadata(
    metadata,
    manifest.meta.provider,
    "stored normalized data",
    "normalization.result",
    undefined
  );
  if (!isObject(metadata)) throw protocolError("stored normalized metadata must be an object");
  if (
    metadata.schemaId !== manifest.data.normalizedSchema.id ||
    typeof metadata.schemaVersion !== "number" ||
    !manifest.data.normalizedSchema.acceptedVersions.includes(metadata.schemaVersion) ||
    !isObject(data) ||
    !isJsonValue(data)
  ) {
    throw protocolError("stored normalized data uses an unsupported schema");
  }
  if (metadata.outcome !== "complete" && metadata.outcome !== "partial") {
    throw protocolError("stored normalized outcome is invalid");
  }
  assertCheckpoint(metadata.checkpoint, "stored normalized checkpoint");
  assertCheckpointSize(metadata.checkpoint, manifest);
  assertIssues(metadata.issues, manifest);
  if (metadata.issues.length > manifest.data.limits.maxIssues) {
    throw protocolError("stored normalized issues exceeds the manifest limit");
  }
  if (!Array.isArray(metadata.sourceSnapshots) || metadata.sourceSnapshots.length < 1) {
    throw protocolError("stored normalized data has no source lineage");
  }
  for (const reference of metadata.sourceSnapshots) {
    if (!isObject(reference)) throw protocolError("stored normalized lineage is invalid");
    assertOnlyKeys(reference, ["partition", "snapshotId", "source"], "stored lineage entry");
    assertSourceName(reference.source, manifest.meta.provider);
    const definition = manifest.data.sources.find((source) => source.id === reference.source);
    if (!definition) throw protocolError("stored lineage source is not declared by the manifest");
    validatePartition(reference.partition, definition.partitions);
    assertNonEmptyString(reference.snapshotId, 200, "stored lineage snapshotId");
  }
  assertByteLimit(value, manifest.data.limits.maxNormalizedBytes, "stored normalized data");
}

export function assertNormalizedProviderData(
  normalized: NormalizedProviderData,
  manifest: ProviderRuntimeManifest,
  input: ProviderNormalizationInput,
  expectedCorrelationId: string | null
): void {
  assertEnvelope(normalized, "normalized data");
  assertProtocolMetadata(
    normalized.meta,
    manifest.meta.provider,
    "normalized data",
    "normalization.result",
    expectedCorrelationId
  );
  if (
    normalized.meta.schemaId !== manifest.data.normalizedSchema.id ||
    normalized.meta.schemaVersion !== manifest.data.normalizedSchema.producedVersion
  ) {
    throw protocolError("normalized schema does not match the runtime manifest");
  }
  if (!isObject(normalized.data) || !isJsonValue(normalized.data)) {
    throw protocolError("normalized data must be a JSON-compatible object");
  }
  if (normalized.meta.outcome !== "complete" && normalized.meta.outcome !== "partial") {
    throw protocolError("normalized outcome is invalid");
  }
  assertIssues(normalized.meta.issues, manifest);
  if (normalized.meta.issues.length > manifest.data.limits.maxIssues) {
    throw protocolError("normalized issues exceeds the manifest limit");
  }
  assertCheckpoint(normalized.meta.checkpoint, "normalized checkpoint");
  assertCheckpointSize(normalized.meta.checkpoint, manifest);
  if (
    !Array.isArray(normalized.meta.sourceSnapshots) ||
    normalized.meta.sourceSnapshots.length < 1
  ) {
    throw protocolError("normalized sourceSnapshots must contain Raw Snapshot lineage");
  }
  const expectedByIdentity = new Map<string, string>();
  for (const reference of input.data.previous?.meta.sourceSnapshots ?? []) {
    expectedByIdentity.set(
      providerRecordIdentity(reference.source, reference.partition),
      reference.snapshotId
    );
  }
  for (const snapshot of input.data.records) {
    expectedByIdentity.set(
      providerRecordIdentity(snapshot.meta.source, snapshot.meta.partition),
      snapshot.meta.snapshotId
    );
  }
  const expected = new Set(
    [...expectedByIdentity].map(([identity, snapshotId]) => `${identity}\u0000${snapshotId}`)
  );
  const actual = new Set<string>();
  for (const reference of normalized.meta.sourceSnapshots) {
    if (!isObject(reference)) throw protocolError("normalized lineage entries must be objects");
    assertOnlyKeys(reference, ["partition", "snapshotId", "source"], "normalized lineage entry");
    assertSourceName(reference.source, manifest.meta.provider);
    validatePartition(reference.partition, undefined);
    assertNonEmptyString(reference.snapshotId, 200, "normalized lineage snapshotId");
    actual.add(
      `${providerRecordIdentity(reference.source, reference.partition)}\u0000${reference.snapshotId}`
    );
  }
  if (
    actual.size !== normalized.meta.sourceSnapshots.length ||
    actual.size !== expected.size ||
    [...expected].some((identity) => !actual.has(identity))
  ) {
    throw protocolError("normalized sourceSnapshots do not match the Raw Snapshot input");
  }
  assertByteLimit(normalized, manifest.data.limits.maxNormalizedBytes, "normalized data");
}

export function assertProviderProjectionBatch(
  batch: ProviderProjectionBatch,
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId: string | null
): void {
  assertEnvelope(batch, "projection batch");
  assertProtocolMetadata(
    batch.meta,
    manifest.meta.provider,
    "projection batch",
    "projection.result",
    expectedCorrelationId
  );
  if (batch.meta.outcome !== "complete" && batch.meta.outcome !== "partial") {
    throw protocolError("projection outcome is invalid");
  }
  assertIssues(batch.meta.issues, manifest);
  if (batch.meta.issues.length > manifest.data.limits.maxIssues) {
    throw protocolError("projection issues exceeds the manifest limit");
  }
  if (!Array.isArray(batch.data)) throw protocolError("projection data must be an array");
  for (const projection of batch.data) {
    if (
      !projection ||
      typeof projection !== "object" ||
      typeof projection.widgetId !== "string" ||
      !projection.widgetId ||
      typeof projection.projectionKey !== "string" ||
      !projection.projectionKey ||
      !Number.isInteger(projection.projectionSchemaVersion) ||
      projection.projectionSchemaVersion < 1 ||
      (projection.sourceSnapshotId !== undefined &&
        projection.sourceSnapshotId !== null &&
        (typeof projection.sourceSnapshotId !== "string" || !projection.sourceSnapshotId)) ||
      !isJsonValue(projection.data)
    ) {
      throw protocolError("projection entries are invalid");
    }
  }
  assertByteLimit(batch, manifest.data.limits.maxProjectionBytes, "projection batch");
}

export function assertProviderProjectionInput(
  input: ProviderProjectionInput,
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId: string
): void {
  assertEnvelope(input, "projection request");
  if (!isObject(input.data)) throw protocolError("projection request data must be an object");
  assertOnlyKeys(input.data, ["normalized", "targets"], "projection request data");
  assertProtocolMetadata(
    input.meta,
    manifest.meta.provider,
    "projection request",
    "projection.request",
    expectedCorrelationId
  );
  assertCompatibleNormalizedData(input.data.normalized, manifest);
  if (input.data.normalized.meta.correlationId !== expectedCorrelationId) {
    throw protocolError("projection normalized data correlationId does not match the request");
  }
  if (!Array.isArray(input.data.targets))
    throw protocolError("projection targets must be an array");
  const identities = new Set<string>();
  for (const target of input.data.targets) {
    if (
      !target ||
      typeof target !== "object" ||
      target.provider !== manifest.meta.provider ||
      typeof target.id !== "string" ||
      !target.id ||
      typeof target.projectionKey !== "string" ||
      !target.projectionKey ||
      !Number.isSafeInteger(target.schemaVersion) ||
      target.schemaVersion < 1 ||
      typeof target.enabled !== "boolean" ||
      typeof target.title !== "string" ||
      !target.title ||
      typeof target.type !== "string" ||
      !target.type ||
      !isObject(target.dataConfig) ||
      !isJsonValue(target.dataConfig) ||
      !isObject(target.presentationConfig) ||
      !isJsonValue(target.presentationConfig)
    ) {
      throw protocolError("projection target is invalid or belongs to another Provider");
    }
    const identity = `${target.id}\u0000${target.projectionKey}`;
    if (identities.has(identity)) throw protocolError("projection targets must be unique");
    identities.add(identity);
  }
}

export function assertProviderProjectionSet(
  targets: readonly ProjectionTarget[],
  projections: readonly BuiltWidgetProjection[],
  normalized: NormalizedProviderData
): void {
  const expected = new Set(targets.map((target) => `${target.id}:${target.projectionKey}`));
  const actual = new Set(
    projections.map((projection) => `${projection.widgetId}:${projection.projectionKey}`)
  );
  if (actual.size !== projections.length || actual.size !== expected.size) {
    throw new ProjectionError("Projection output did not match the active target set.");
  }
  for (const key of expected) {
    if (!actual.has(key)) throw new ProjectionError("Projection output omitted an active target.");
  }
  const sourceSnapshotIds = new Set(
    normalized.meta.sourceSnapshots.map((source) => source.snapshotId)
  );
  for (const projection of projections) {
    if (projection.sourceSnapshotId && !sourceSnapshotIds.has(projection.sourceSnapshotId)) {
      throw new ProjectionError("Projection references unknown source snapshot lineage.");
    }
  }
}

export function unwrapProviderResult<T>(
  result: T | ProviderFailure,
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId: string | null
): T {
  if (!isProviderFailure(result)) return result;
  assertProviderFailure(result, manifest, expectedCorrelationId);
  const failure = result.data;
  switch (failure.category) {
    case "transport":
    case "rate_limit":
      return throwError(
        new RetryableProviderError(
          "The Provider reported a retryable failure.",
          failure.code,
          failure.retryAfterMs
        )
      );
    case "credential":
      return throwError(new ProviderCredentialError(failure.credentialStatus ?? "invalid"));
    case "schema":
      return throwError(new ProviderSchemaMismatchError(failure.source ?? manifest.meta.provider));
    case "normalization":
      return throwError(new NormalizationError("The Provider could not normalize its data."));
    case "projection":
      return throwError(new ProjectionError("The Provider could not project its data."));
    case "protocol":
      return throwError(new ProviderProtocolError("The Provider rejected the protocol message."));
    case "configuration":
    case "permanent":
      return throwError(new PermanentProviderError("The Provider reported a permanent failure."));
  }
}

export function providerRecordIdentity(source: string, partition: ProviderPartition): string {
  return providerSourcePartitionIdentity(source, partition);
}

function validateSourceRecord(
  record: ProviderSourceRecord,
  manifest: ProviderRuntimeManifest,
  produced: boolean,
  expectedCorrelationId: string | null | undefined
): void {
  assertEnvelope(record, "source record");
  assertProtocolMetadata(
    record.meta,
    manifest.meta.provider,
    "source record",
    "source.record",
    expectedCorrelationId
  );
  const definition = validateSourceMetadata(record.meta, manifest, produced);
  if (!isJsonValue(record.data)) throw protocolError("source record data is not JSON-compatible");
  assertSafeProviderData(record.data, "source record data");
  validateDataShape(record.data, definition.dataShape, record.meta.operation);
  if (record.meta.operation === "delete" && record.data !== null) {
    throw protocolError("delete records must carry null data");
  }
  if (record.meta.payloadKind === "blob_reference") {
    validateBlobReference(record.data);
    if (record.meta.mediaType !== PROVIDER_BLOB_REFERENCE_MEDIA_TYPE) {
      throw protocolError("blob references must use the protocol blob-reference media type");
    }
  }
}

function validateSourceMetadata(
  metadata: ProviderSourceRecord["meta"] | ProviderSnapshotRecord["meta"],
  manifest: ProviderRuntimeManifest,
  produced: boolean
): ProviderSourceDefinition {
  assertSourceName(metadata.source, manifest.meta.provider);
  const definition = manifest.data.sources.find((candidate) => candidate.id === metadata.source);
  if (!definition) throw protocolError("source is not declared by the runtime manifest");
  if (metadata.schemaId !== definition.schema.id) {
    throw protocolError("source schemaId does not match the runtime manifest");
  }
  const versions = produced
    ? [definition.schema.producedVersion]
    : definition.schema.acceptedVersions;
  if (!versions.includes(metadata.schemaVersion)) {
    throw protocolError("source schemaVersion is not accepted by the runtime manifest");
  }
  if (!definition.mediaTypes.includes(metadata.mediaType)) {
    throw protocolError("source mediaType is not declared by the runtime manifest");
  }
  if (!definition.payloadKinds.includes(metadata.payloadKind)) {
    throw protocolError("source payloadKind is not declared by the runtime manifest");
  }
  if (!definition.operations.includes(metadata.operation)) {
    throw protocolError("source operation is not declared by the runtime manifest");
  }
  validatePartition(metadata.partition, definition.partitions);
  if (!isCanonicalTimestamp(metadata.collectedAt)) {
    throw protocolError("collectedAt must be a canonical RFC 3339 UTC timestamp");
  }
  if (metadata.sourceUpdatedAt !== null && !isCanonicalTimestamp(metadata.sourceUpdatedAt)) {
    throw protocolError("sourceUpdatedAt must be null or a canonical RFC 3339 UTC timestamp");
  }
  return definition;
}

function validateDataShape(
  value: JsonValue,
  shape: ProviderDataShape,
  operation: ProviderRecordOperation
): void {
  if (operation === "delete") return;
  const object = isObject(value);
  const collection = object || Array.isArray(value);
  switch (shape) {
    case "scalar":
      if (object || Array.isArray(value))
        throw protocolError("scalar source emitted structured data");
      return;
    case "document":
    case "graph":
      if (!object) throw protocolError(`${shape} source must emit an object`);
      return;
    case "collection":
    case "time_series":
      if (!collection) throw protocolError(`${shape} source must emit an array or object`);
      return;
    case "media":
      if (!object)
        throw protocolError("media source must emit a metadata object or Blob reference");
      return;
    case "mixed":
      return;
  }
}

function assertSourceDefinition(
  definition: ProviderSourceDefinition,
  provider: ProviderType,
  manifestPayloadKinds: readonly ProviderPayloadKind[]
): void {
  if (!isObject(definition)) throw protocolError("manifest source definitions must be objects");
  assertOnlyKeys(
    definition,
    [
      "criticality",
      "dataShape",
      "extensions",
      "id",
      "mediaTypes",
      "operations",
      "partitions",
      "payloadKinds",
      "schema"
    ],
    "manifest source definition"
  );
  assertSourceName(definition.id, provider);
  if (!DATA_SHAPES.includes(definition.dataShape)) {
    throw protocolError("manifest source dataShape is invalid");
  }
  if (definition.criticality !== "required" && definition.criticality !== "optional") {
    throw protocolError("manifest source criticality is invalid");
  }
  assertExtensions(definition.extensions, `source '${definition.id}' extensions`);
  assertUniqueEnumValues(definition.partitions, PARTITION_KINDS, "source partitions");
  assertUniqueEnumValues(definition.payloadKinds, PAYLOAD_KINDS, "source payloadKinds");
  assertUniqueEnumValues(definition.operations, RECORD_OPERATIONS, "source operations");
  if (definition.payloadKinds.some((kind) => !manifestPayloadKinds.includes(kind))) {
    throw protocolError("source payloadKinds exceed manifest capabilities");
  }
  if (!Array.isArray(definition.mediaTypes) || definition.mediaTypes.length < 1) {
    throw protocolError("source mediaTypes must be a non-empty array");
  }
  const mediaTypes = new Set<string>();
  for (const mediaType of definition.mediaTypes) {
    if (typeof mediaType !== "string" || !MEDIA_TYPE_PATTERN.test(mediaType)) {
      throw protocolError("source mediaType is invalid");
    }
    if (mediaTypes.has(mediaType)) throw protocolError("source mediaTypes must be unique");
    mediaTypes.add(mediaType);
  }
  if (
    definition.payloadKinds.includes("blob_reference") &&
    !definition.mediaTypes.includes(PROVIDER_BLOB_REFERENCE_MEDIA_TYPE)
  ) {
    throw protocolError("blob-reference sources must declare the protocol media type");
  }
  assertSchemaSupport(definition.schema, `source '${definition.id}' schema`);
}

function assertSchemaSupport(schema: ProviderSchemaSupport, label: string): void {
  if (!isObject(schema) || typeof schema.id !== "string" || !SCHEMA_ID_PATTERN.test(schema.id)) {
    throw protocolError(`${label} id must be an absolute URI or URN`);
  }
  assertOnlyKeys(schema, ["acceptedVersions", "id", "producedVersion"], label);
  assertPositiveInteger(schema.producedVersion, `${label} producedVersion`);
  if (!Array.isArray(schema.acceptedVersions) || schema.acceptedVersions.length < 1) {
    throw protocolError(`${label} acceptedVersions must be non-empty`);
  }
  const versions = new Set<number>();
  for (const version of schema.acceptedVersions) {
    assertPositiveInteger(version, `${label} accepted version`);
    if (versions.has(version)) throw protocolError(`${label} acceptedVersions must be unique`);
    versions.add(version);
  }
  if (!versions.has(schema.producedVersion)) {
    throw protocolError(`${label} must accept its producedVersion`);
  }
}

function validatePartition(
  partition: unknown,
  acceptedKinds: readonly ProviderPartitionKind[] | undefined
): asserts partition is ProviderPartition {
  if (!isObject(partition) || !isPartitionKind(partition.kind)) {
    throw protocolError("record partition is invalid");
  }
  if (acceptedKinds && !acceptedKinds.includes(partition.kind)) {
    throw protocolError("record partition kind is not declared by the source");
  }
  switch (partition.kind) {
    case "singleton":
      if (Object.keys(partition).length !== 1) {
        throw protocolError("singleton partition contains unexpected fields");
      }
      return;
    case "index":
      assertOnlyKeys(partition, ["index", "kind"], "index partition");
      assertNonNegativeInteger(partition.index, "partition index");
      return;
    case "cursor":
      assertOnlyKeys(partition, ["cursor", "index", "kind"], "cursor partition");
      assertNonNegativeInteger(partition.index, "partition cursor index");
      if (partition.cursor !== null) {
        assertSafeOpaqueString(partition.cursor, 4_096, "partition cursor");
      }
      return;
    case "key":
      assertOnlyKeys(partition, ["key", "kind"], "key partition");
      assertSafeOpaqueString(partition.key, 1_024, "partition key");
      return;
    case "time_window":
      assertOnlyKeys(partition, ["end", "kind", "start"], "time-window partition");
      if (!isCanonicalTimestamp(partition.start) || !isCanonicalTimestamp(partition.end)) {
        throw protocolError("time-window partitions require canonical RFC 3339 timestamps");
      }
      if (partition.start >= partition.end) {
        throw protocolError("time-window partition start must precede end");
      }
  }
}

function isPartitionKind(value: unknown): value is ProviderPartitionKind {
  return typeof value === "string" && PARTITION_KINDS.includes(value as ProviderPartitionKind);
}

function validateBlobReference(value: unknown): asserts value is ProviderBlobReference {
  if (!isObject(value) || value.kind !== "blob_reference") {
    throw protocolError("blob-reference payload is invalid");
  }
  assertOnlyKeys(
    value,
    ["byteLength", "fileName", "kind", "mediaType", "sha256", "storageKey"],
    "blob reference"
  );
  assertNonNegativeInteger(value.byteLength, "blob byteLength");
  if (value.fileName !== null) assertNonEmptyString(value.fileName, 512, "blob fileName");
  if (typeof value.mediaType !== "string" || !MEDIA_TYPE_PATTERN.test(value.mediaType)) {
    throw protocolError("blob mediaType is invalid");
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw protocolError("blob sha256 must be lower-case SHA-256");
  }
  assertSafeOpaqueString(value.storageKey, 1_024, "blob storageKey");
}

function assertProviderFailure(
  failure: ProviderFailure,
  manifest: ProviderRuntimeManifest,
  expectedCorrelationId: string | null
): void {
  assertEnvelope(failure, "failure");
  assertProtocolMetadata(
    failure.meta,
    manifest.meta.provider,
    "failure",
    "failure",
    expectedCorrelationId
  );
  const value = failure.data;
  if (!isObject(value)) throw protocolError("failure data must be an object");
  assertOnlyKeys(
    value,
    [
      "category",
      "code",
      "credentialStatus",
      "message",
      "partition",
      "retryable",
      "retryAfterMs",
      "source"
    ],
    "failure data"
  );
  if (
    ![
      "configuration",
      "credential",
      "normalization",
      "permanent",
      "projection",
      "protocol",
      "rate_limit",
      "schema",
      "transport"
    ].includes(value.category)
  ) {
    throw protocolError("failure category is invalid");
  }
  if (typeof value.code !== "string" || !CODE_PATTERN.test(value.code) || value.code.length > 120) {
    throw protocolError("failure code is invalid");
  }
  assertSafeMessage(value.message, "failure message");
  if (value.partition !== null) {
    validatePartition(value.partition, undefined);
    if (value.source === null) throw protocolError("partitioned failures require a source");
  }
  if (typeof value.retryable !== "boolean") throw protocolError("failure retryable is invalid");
  if (value.retryAfterMs !== null) assertNonNegativeInteger(value.retryAfterMs, "retryAfterMs");
  if (value.source !== null) {
    assertSourceName(value.source, manifest.meta.provider);
    const definition = manifest.data.sources.find((source) => source.id === value.source);
    if (!definition) throw protocolError("failure source is not declared by the manifest");
    if (value.partition !== null) validatePartition(value.partition, definition.partitions);
  }
  if (
    value.credentialStatus !== null &&
    value.credentialStatus !== "expired" &&
    value.credentialStatus !== "invalid"
  ) {
    throw protocolError("failure credentialStatus is invalid");
  }
  if (value.category === "credential" && value.credentialStatus === null) {
    throw protocolError("credential failures require credentialStatus");
  }
  if (value.retryable !== ["rate_limit", "transport"].includes(value.category)) {
    throw protocolError("failure retryability does not match its category");
  }
  assertByteLimit(failure, 65_536, "failure message");
}

function isProviderFailure(value: unknown): value is ProviderFailure {
  return isObject(value) && isObject(value.meta) && value.meta.kind === "failure";
}

function assertProtocolMetadata(
  metadata: unknown,
  expectedProvider: ProviderType,
  stage: string,
  kind: ProviderMessageKind,
  expectedCorrelationId: string | null | undefined
): void {
  if (!isObject(metadata)) throw protocolError(`${stage} metadata must be an object`);
  if (
    metadata.protocol !== PROVIDER_DATA_PROTOCOL ||
    metadata.protocolVersion !== PROVIDER_DATA_PROTOCOL_VERSION
  ) {
    throw protocolError(`${stage} uses an unsupported protocol version`);
  }
  if (metadata.kind !== kind) throw protocolError(`${stage} message kind is invalid`);
  if (metadata.provider !== expectedProvider) {
    throw protocolError(`${stage} Provider identity does not match`);
  }
  if (metadata.correlationId !== null && typeof metadata.correlationId !== "string") {
    throw protocolError(`${stage} correlationId is invalid`);
  }
  if (expectedCorrelationId !== undefined && metadata.correlationId !== expectedCorrelationId) {
    throw protocolError(`${stage} correlationId does not match the operation`);
  }
  const allowedKeys = new Set(metadataKeys(kind));
  if (Object.keys(metadata).some((key) => !allowedKeys.has(key))) {
    throw protocolError(`${stage} metadata contains fields outside the extensions namespace`);
  }
  assertExtensions(metadata.extensions, `${stage} extensions`);
}

function metadataKeys(kind: ProviderMessageKind): readonly string[] {
  const base = ["correlationId", "extensions", "kind", "protocol", "protocolVersion", "provider"];
  switch (kind) {
    case "source.record":
      return [
        ...base,
        "collectedAt",
        "mediaType",
        "operation",
        "partition",
        "payloadKind",
        "schemaId",
        "schemaVersion",
        "source",
        "sourceUpdatedAt"
      ];
    case "snapshot.record":
      return [
        ...base,
        "checkpoint",
        "collectedAt",
        "collectionMode",
        "collectionOutcome",
        "connectionId",
        "issues",
        "mediaType",
        "operation",
        "partition",
        "payloadHash",
        "payloadKind",
        "runId",
        "schemaId",
        "schemaVersion",
        "snapshotId",
        "source",
        "sourceUpdatedAt",
        "storedAt"
      ];
    case "normalization.result":
      return [
        ...base,
        "checkpoint",
        "issues",
        "outcome",
        "schemaId",
        "schemaVersion",
        "sourceSnapshots"
      ];
    case "projection.result":
      return [...base, "issues", "outcome"];
    default:
      return base;
  }
}

function assertIssues(
  issues: unknown,
  manifest: ProviderRuntimeManifest
): asserts issues is readonly ProviderIssue[] {
  if (!Array.isArray(issues)) throw protocolError("issues must be an array");
  const identities = new Set<string>();
  for (const issue of issues) {
    if (!isObject(issue)) throw protocolError("issue entries must be objects");
    assertOnlyKeys(
      issue,
      ["code", "message", "partition", "retryable", "severity", "source"],
      "issue"
    );
    if (
      typeof issue.code !== "string" ||
      !CODE_PATTERN.test(issue.code) ||
      issue.code.length > 120
    ) {
      throw protocolError("issue code is invalid");
    }
    assertSafeMessage(issue.message, "issue message");
    if (typeof issue.retryable !== "boolean") throw protocolError("issue retryable is invalid");
    if (issue.severity !== "warning" && issue.severity !== "error") {
      throw protocolError("issue severity is invalid");
    }
    if (issue.source !== null) {
      assertSourceName(issue.source, manifest.meta.provider);
      const definition = manifest.data.sources.find((source) => source.id === issue.source);
      if (!definition) throw protocolError("issue source is not declared by the manifest");
      if (issue.partition !== null) validatePartition(issue.partition, definition.partitions);
    }
    if (issue.partition !== null) {
      validatePartition(issue.partition, undefined);
      if (issue.source === null) throw protocolError("partitioned issues require a source");
    }
    const identity = `${issue.code}\u0000${issue.source ?? ""}\u0000${
      issue.partition ? providerRecordIdentity(issue.source ?? "", issue.partition) : ""
    }`;
    if (identities.has(identity)) {
      throw protocolError("issues must be unique by code, source, and partition");
    }
    identities.add(identity);
  }
}

function assertCheckpoint(value: unknown, label: string): asserts value is JsonObject | null {
  if (value !== null && (!isObject(value) || !isJsonValue(value))) {
    throw protocolError(`${label} must be null or a JSON-compatible object`);
  }
  if (value !== null) assertNoCredentialLikeKeys(value, label);
}

function assertCheckpointSize(
  checkpoint: JsonObject | null,
  manifest: ProviderRuntimeManifest
): void {
  if (checkpoint !== null && jsonByteLength(checkpoint) > manifest.data.limits.maxCheckpointBytes) {
    throw protocolError("checkpoint exceeds the manifest byte limit");
  }
}

function assertContinuation(
  continuation: unknown,
  manifest: ProviderRuntimeManifest,
  label: string
): void {
  if (continuation === null) return;
  if (!manifest.data.capabilities.continuation) {
    throw protocolError(`${label} was provided without manifest support`);
  }
  assertSafeOpaqueString(continuation, 4_096, label);
}

function assertExtensions(value: unknown, label: string): void {
  if (!isObject(value) || !isJsonValue(value)) {
    throw protocolError(`${label} must be a JSON-compatible object`);
  }
  for (const key of Object.keys(value)) {
    if (!EXTENSION_KEY_PATTERN.test(key)) {
      throw protocolError(`${label} keys must be namespaced`);
    }
  }
  assertNoCredentialLikeKeys(value, label);
  assertByteLimit(value, PROVIDER_HOST_MAX_EXTENSION_BYTES, label);
}

function assertNoCredentialLikeKeys(
  value: JsonObject,
  label: string,
  errorFactory: (detail: string) => Error = protocolError
): void {
  visitJson(value, (key, nested) => {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    if (
      normalized === "authorization" ||
      normalized === "csrf" ||
      normalized === "musicu" ||
      normalized === "token" ||
      normalized.endsWith("accesstoken") ||
      normalized.endsWith("refreshtoken") ||
      normalized.endsWith("apikey") ||
      normalized.endsWith("cookie") ||
      normalized.endsWith("password") ||
      normalized.endsWith("secret")
    ) {
      throw errorFactory(`${label} contains credential-like key '${key}'`);
    }
    if (typeof nested === "string" && CREDENTIAL_MARKER.test(nested)) {
      throw errorFactory(`${label} contains credential-like text`);
    }
  });
}

function assertSafeProviderData(value: JsonValue, label: string): void {
  if (typeof value === "string" && CREDENTIAL_MARKER.test(value)) {
    throw sanitizationError(`${label} contains credential-like text`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeProviderData(item, label);
    return;
  }
  if (isObject(value)) assertNoCredentialLikeKeys(value, label, sanitizationError);
}

function visitJson(value: JsonValue, visitor: (key: string, value: JsonValue) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitJson(item, visitor);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    visitor(key, nested);
    visitJson(nested, visitor);
  }
}

function assertSourceName(
  source: unknown,
  expectedProvider: ProviderType
): asserts source is string {
  if (
    typeof source !== "string" ||
    source.length > 160 ||
    !SOURCE_PATTERN.test(source) ||
    !source.startsWith(`${expectedProvider}.`)
  ) {
    throw protocolError("source identifiers must be stable and Provider-namespaced");
  }
}

function assertEnvelope(value: unknown, stage: string): void {
  if (!isObject(value)) throw protocolError(`${stage} must be an envelope object`);
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("data") || !keys.includes("meta")) {
    throw protocolError(`${stage} must contain only data and meta`);
  }
}

function assertOnlyKeys(value: object, allowed: readonly string[], label: string): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some((key) => !accepted.has(key))) {
    throw protocolError(`${label} contains an unsupported field`);
  }
}

function assertByteLimit(value: unknown, maximum: number, label: string): void {
  if (jsonByteLength(value) > maximum) {
    throw protocolError(`${label} exceeds its declared byte limit`);
  }
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function providerMessageByteLength(value: unknown): number {
  return jsonByteLength(value);
}

function assertUniqueEnumValues<T extends string>(
  values: readonly T[],
  allowed: readonly T[],
  label: string
): void {
  if (!Array.isArray(values) || values.length < 1) {
    throw protocolError(`${label} must be a non-empty array`);
  }
  const unique = new Set<string>();
  for (const value of values) {
    if (!allowed.includes(value)) throw protocolError(`${label} contains an unsupported value`);
    if (unique.has(value)) throw protocolError(`${label} must not contain duplicates`);
    unique.add(value);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw protocolError(`${label} must be a positive safe integer`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw protocolError(`${label} must be a non-negative safe integer`);
  }
}

function assertNonEmptyString(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw protocolError(`${label} must be a non-empty bounded string`);
  }
}

function assertSafeOpaqueString(
  value: unknown,
  max: number,
  label: string
): asserts value is string {
  assertNonEmptyString(value, max, label);
  if (CREDENTIAL_MARKER.test(value)) throw protocolError(`${label} contains credential-like text`);
}

function assertSafeMessage(value: unknown, label: string): asserts value is string {
  assertNonEmptyString(value, 500, label);
  if (CREDENTIAL_MARKER.test(value)) throw protocolError(`${label} contains credential-like text`);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown, ancestors = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") {
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const valid = value.every((item) => isJsonValue(item, ancestors));
    ancestors.delete(value);
    return valid;
  }
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalNullableJson(value: JsonObject | null): string {
  return value === null ? "null" : canonicalJson(value);
}

function throwError(error: Error): never {
  throw error;
}

function protocolError(detail: string) {
  return new ProviderProtocolError(`Provider protocol violation: ${detail}.`);
}

function sanitizationError(detail: string) {
  return new RawSnapshotSanitizationError(`Provider data safety violation: ${detail}.`);
}
