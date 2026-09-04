import {
  encodeProviderSourceContext,
  NormalizationError,
  PermanentProviderError,
  ProjectionError,
  providerProtocolMetadata,
  ProviderCredentialError,
  RawSnapshotSanitizationError,
  SyncPipelineError,
  SyncRunNotFoundError,
  toProviderSnapshotRecord
} from "@nivalis/domain";
import type {
  JsonValue,
  ProviderNormalizationInput,
  ProviderProjectionInput,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { ProjectionRepository } from "../ports/projection-repository";
import type {
  ProviderRuntimeRegistry,
  SyncIdentityFactory,
  SyncUnitOfWork
} from "../ports/sync-runtime";
import { collectProviderData } from "./provider-collection-service";
import {
  assertCompatibleNormalizedData,
  assertNormalizedProviderData,
  assertProviderNormalizationInput,
  assertProviderProjectionBatch,
  assertProviderProjectionInput,
  assertProviderProjectionSet,
  unwrapProviderResult
} from "../validation/provider-protocol-validation";

export class SyncWorkerService {
  constructor(
    private readonly unitOfWork: SyncUnitOfWork,
    private readonly projections: ProjectionRepository,
    private readonly providers: ProviderRuntimeRegistry,
    private readonly identities: SyncIdentityFactory,
    private readonly clock: Clock,
    private readonly maxAttempts: number,
    private readonly claimTimeoutMs: number
  ) {}

  async process(syncRunId: string): Promise<SyncRun> {
    const existing = await this.unitOfWork.run((repository) => repository.getRun(syncRunId));
    if (!existing) throw new SyncRunNotFoundError(syncRunId);
    const now = this.clock.now();
    const claimed = await this.unitOfWork.run((repository) =>
      repository.claimRun(syncRunId, now, new Date(now.getTime() - this.claimTimeoutMs))
    );
    if (!claimed) return existing;

    try {
      const connection = await this.unitOfWork.run((repository) =>
        repository.getConnection(claimed.providerConnectionId)
      );
      if (!connection?.enabled) {
        throw new PermanentProviderError("Provider connection is unavailable or disabled.");
      }
      const runtime = this.providers.get(claimed.provider);
      if (!runtime) throw new PermanentProviderError("Provider runtime is unavailable.");
      const previousNormalized = runtime.manifest.data.capabilities.collectionModes.includes(
        "incremental"
      )
        ? await this.unitOfWork.run((repository) =>
            repository.getPreviousNormalizedData(claimed.providerConnectionId, claimed.id)
          )
        : null;
      if (previousNormalized) {
        assertCompatibleNormalizedData(previousNormalized, runtime.manifest);
      }
      const collection = await collectProviderData(runtime, claimed, {
        checkpoint: previousNormalized?.meta.checkpoint ?? null
      });
      const fetched = collection.records;
      if (fetched.length === 0 && (collection.mode === "snapshot" || previousNormalized === null)) {
        throw new NormalizationError("Provider returned no Raw Snapshot payloads.");
      }
      for (const item of fetched) assertSanitized(item.data, item.meta.source);
      const snapshots: RawSnapshot[] = [];
      for (const item of fetched) {
        const snapshot = await this.unitOfWork.run((repository) =>
          repository.insertRawSnapshot(
            {
              fetchedAt: new Date(item.meta.collectedAt),
              payload: item.data,
              payloadHash: this.identities.hashPayload(item.data),
              provider: claimed.provider,
              providerConnectionId: claimed.providerConnectionId,
              schemaVersion: item.meta.schemaVersion,
              sourceKind: item.meta.source,
              sourceCursor: encodeProviderSourceContext(item, collection),
              ...(item.meta.sourceUpdatedAt
                ? { sourceTimestamp: new Date(item.meta.sourceUpdatedAt) }
                : {}),
              syncRunId
            },
            this.clock.now()
          )
        );
        snapshots.push(snapshot);
      }
      const normalizationRecords = snapshots.map(toProviderSnapshotRecord);
      const normalizationInput = {
        data: {
          checkpoint: collection.checkpoint,
          collectionMode: collection.mode,
          collectionOutcome: collection.outcome,
          issues: collection.issues,
          previous: collection.mode === "incremental" ? previousNormalized : null,
          records: normalizationRecords
        },
        meta: providerProtocolMetadata("normalization.request", claimed.provider, claimed.id)
      } satisfies ProviderNormalizationInput;
      assertProviderNormalizationInput(normalizationInput, runtime.manifest, claimed.id);
      const normalizationResult = await normalizeProvider(
        runtime.normalizer.normalize(normalizationInput)
      );
      const normalized = unwrapProviderResult(normalizationResult, runtime.manifest, claimed.id);
      assertNormalizedProviderData(normalized, runtime.manifest, normalizationInput, claimed.id);
      const targets = await this.projections.listActiveTargets(connection);
      const projectionInput = {
        data: { normalized, targets },
        meta: providerProtocolMetadata("projection.request", claimed.provider, claimed.id)
      } satisfies ProviderProjectionInput;
      assertProviderProjectionInput(projectionInput, runtime.manifest, claimed.id);
      const projectionResult = await projectProvider(runtime.projector.project(projectionInput));
      const projectionBatch = unwrapProviderResult(projectionResult, runtime.manifest, claimed.id);
      assertProviderProjectionBatch(projectionBatch, runtime.manifest, claimed.id);
      const built = projectionBatch.data;
      assertProviderProjectionSet(targets, built, normalized);
      const sourceSnapshotId = snapshots[0]?.id ?? normalized.meta.sourceSnapshots[0]?.snapshotId;
      if (!sourceSnapshotId) {
        throw new ProjectionError("Normalized data has no source snapshot lineage.");
      }
      return await this.unitOfWork.run(async (repository, nativeStores) => {
        const currentConnection = await repository.getConnection(claimed.providerConnectionId);
        if (!currentConnection?.enabled) {
          throw new PermanentProviderError(
            "Provider connection was disabled before projection commit."
          );
        }
        const nativeStore = nativeStores.get(claimed.provider);
        if (nativeStore) {
          await nativeStore.persist({
            generatedAt: this.clock.now(),
            normalized,
            providerConnectionId: claimed.providerConnectionId
          });
        }
        await repository.insertNormalizedSnapshot({
          generatedAt: this.clock.now(),
          normalized,
          provider: claimed.provider,
          providerConnectionId: claimed.providerConnectionId,
          syncRunId
        });
        const completed = await repository.completeRun({
          generatedAt: this.clock.now(),
          projections: built,
          projectionVersionId: this.identities.create(),
          provider: claimed.provider,
          providerConnectionId: claimed.providerConnectionId,
          sourceSnapshotId,
          syncRunId
        });
        await repository.markCredentialStatus(
          claimed.providerConnectionId,
          "valid",
          this.clock.now()
        );
        return completed;
      });
    } catch (cause) {
      const error = classifyPipelineError(cause);
      const safeMessage = publicErrorMessage(error);
      if (error.retryable && claimed.attemptCount < this.maxAttempts) {
        await this.unitOfWork.run((repository) =>
          repository.markRetryWait(syncRunId, error.code, safeMessage, this.clock.now())
        );
        throw error;
      }
      const failed = await this.unitOfWork.run(async (repository) => {
        const terminal = await repository.markFailed(
          syncRunId,
          error.code,
          safeMessage,
          this.clock.now()
        );
        if (error instanceof ProviderCredentialError) {
          await repository.markCredentialStatus(
            claimed.providerConnectionId,
            error.credentialStatus,
            this.clock.now()
          );
        }
        return terminal;
      });
      if (error.retryable) throw error;
      return failed;
    }
  }
}

function publicErrorMessage(error: SyncPipelineError) {
  switch (error.code) {
    case "retryable-provider-error":
      return "The Provider request failed temporarily.";
    case "permanent-provider-error":
      return "The Provider request cannot succeed without configuration changes.";
    case "provider-credential-error":
      return "The Provider credential is invalid or expired and must be reconnected.";
    case "provider-protocol-error":
      return "The Provider adapter returned data that violates the integration protocol.";
    case "provider-schema-mismatch":
      return "The Provider response schema changed and could not be processed safely.";
    case "normalization-error":
      return "The Provider payload could not be normalized.";
    case "projection-error":
      return "Widget projections could not be built.";
    case "raw-snapshot-sanitization-error":
      return "The Provider payload was rejected by the Raw Snapshot safety policy.";
    default:
      return "The synchronization pipeline failed.";
  }
}

async function normalizeProvider<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof SyncPipelineError) throw error;
    throw new NormalizationError("Provider payload normalization failed.");
  }
}

async function projectProvider<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof SyncPipelineError) throw error;
    throw new ProjectionError("Widget projection build failed.");
  }
}

function classifyPipelineError(error: unknown): SyncPipelineError {
  return error instanceof SyncPipelineError
    ? error
    : new ProjectionError("Synchronization pipeline failed.");
}

function assertSanitized(value: JsonValue, path = "payload") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSanitized(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    const credentialSuffixes = [
      "cookie",
      "cookies",
      "token",
      "apikey",
      "accesskey",
      "secret",
      "secretkey",
      "password"
    ];
    if (
      normalized === "authorization" ||
      normalized === "csrf" ||
      normalized === "musicu" ||
      credentialSuffixes.some((suffix) => normalized.endsWith(suffix))
    ) {
      throw new RawSnapshotSanitizationError(`Unsafe credential-like key at ${path}.${key}.`);
    }
    assertSanitized(nested, `${path}.${key}`);
  }
}
