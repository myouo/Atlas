import {
  ProjectionError,
  providerProtocolMetadata,
  RawSnapshotNotFoundError,
  toProviderSnapshotRecord
} from "@nivalis/domain";
import type {
  BuiltWidgetProjection,
  JsonValue,
  NormalizedProviderData,
  ProviderNormalizationInput,
  ProviderProjectionInput,
  ProviderSourceSnapshotReference,
  ProviderType
} from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { ProjectionRepository } from "../ports/projection-repository";
import type {
  ProviderRuntimeRegistry,
  SyncIdentityFactory,
  SyncUnitOfWork
} from "../ports/sync-runtime";
import {
  assertNormalizedProviderData,
  assertProviderManifest,
  assertProviderNormalizationInput,
  assertProviderProjectionBatch,
  assertProviderProjectionInput,
  assertProviderProjectionSet,
  assertProviderSnapshotRecords,
  unwrapProviderResult
} from "../validation/provider-protocol-validation";

export interface ProviderReplayResult {
  readonly committed: boolean;
  readonly diff: readonly {
    readonly change: "create" | "replace" | "unchanged";
    readonly previousProjectionVersionId: string | null;
    readonly projectionKey: string;
    readonly widgetId: string;
  }[];
  readonly normalized: NormalizedProviderData;
  readonly projections: readonly BuiltWidgetProjection[];
  readonly provider: ProviderType;
  readonly snapshotIds: readonly string[];
  readonly sources: readonly ProviderSourceSnapshotReference[];
  readonly syncRunId: string;
}

export class ProviderReplayService {
  constructor(
    private readonly unitOfWork: SyncUnitOfWork,
    private readonly projections: ProjectionRepository,
    private readonly providers: ProviderRuntimeRegistry,
    private readonly identities: SyncIdentityFactory,
    private readonly clock: Clock
  ) {}

  async replay(snapshotId: string, commit = false): Promise<ProviderReplayResult> {
    const selected = await this.unitOfWork.run((repository) =>
      repository.getRawSnapshot(snapshotId)
    );
    if (!selected) throw new RawSnapshotNotFoundError(snapshotId);
    const snapshots = await this.unitOfWork.run((repository) =>
      repository.listRawSnapshotsForRun(selected.syncRunId)
    );
    const connection = await this.unitOfWork.run((repository) =>
      repository.getConnection(selected.providerConnectionId)
    );
    if (!connection) throw new ProjectionError("Replay Provider connection was not found.");
    const runtime = this.providers.get(selected.provider);
    if (!runtime) throw new ProjectionError("Replay Provider runtime is unavailable.");
    assertProviderManifest(runtime.manifest, selected.provider);
    const normalizationRecords = snapshots.map(toProviderSnapshotRecord);
    assertProviderSnapshotRecords(normalizationRecords, runtime.manifest, selected.syncRunId);
    const collection = normalizationRecords[0]!.meta;
    const previousNormalized =
      collection.collectionMode === "incremental"
        ? await this.unitOfWork.run((repository) =>
            repository.getPreviousNormalizedData(selected.providerConnectionId, selected.syncRunId)
          )
        : null;
    const normalizationInput = {
      data: {
        checkpoint: collection.checkpoint,
        collectionMode: collection.collectionMode,
        collectionOutcome: collection.collectionOutcome,
        issues: collection.issues,
        previous: previousNormalized,
        records: normalizationRecords
      },
      meta: providerProtocolMetadata("normalization.request", selected.provider, selected.syncRunId)
    } satisfies ProviderNormalizationInput;
    assertProviderNormalizationInput(normalizationInput, runtime.manifest, selected.syncRunId);
    const normalizationResult = await runtime.normalizer.normalize(normalizationInput);
    const normalized = unwrapProviderResult(
      normalizationResult,
      runtime.manifest,
      selected.syncRunId
    );
    assertNormalizedProviderData(
      normalized,
      runtime.manifest,
      normalizationInput,
      selected.syncRunId
    );
    const targets = await this.projections.listActiveTargets(connection);
    const projectionInput = {
      data: { normalized, targets },
      meta: providerProtocolMetadata("projection.request", selected.provider, selected.syncRunId)
    } satisfies ProviderProjectionInput;
    assertProviderProjectionInput(projectionInput, runtime.manifest, selected.syncRunId);
    const projectionResult = await runtime.projector.project(projectionInput);
    const projectionBatch = unwrapProviderResult(
      projectionResult,
      runtime.manifest,
      selected.syncRunId
    );
    assertProviderProjectionBatch(projectionBatch, runtime.manifest, selected.syncRunId);
    const built = projectionBatch.data;
    assertProviderProjectionSet(targets, built, normalized);
    const current = await this.projections.getStoredProjections(targets);
    const byIdentity = new Map(
      current.map((projection) => [
        `${projection.widgetId}:${projection.projectionKey}`,
        projection
      ])
    );
    const diff = built.map((projection) => {
      const previous = byIdentity.get(`${projection.widgetId}:${projection.projectionKey}`);
      return {
        change: !previous
          ? ("create" as const)
          : sameJson(previous.data, projection.data)
            ? ("unchanged" as const)
            : ("replace" as const),
        previousProjectionVersionId: previous?.projectionVersionId ?? null,
        projectionKey: projection.projectionKey,
        widgetId: projection.widgetId
      };
    });

    if (commit) {
      const generatedAt = this.clock.now();
      await this.unitOfWork.run(async (repository, nativeStores) => {
        const nativeStore = nativeStores.get(selected.provider);
        if (!nativeStore) {
          throw new ProjectionError("Replay Native Store is unavailable.");
        }
        await nativeStore.persist({
          generatedAt,
          normalized,
          providerConnectionId: selected.providerConnectionId
        });
        await repository.commitProjectionReplay({
          generatedAt,
          projections: built,
          projectionVersionId: this.identities.create(),
          provider: selected.provider,
          providerConnectionId: selected.providerConnectionId,
          sourceSnapshotId: selected.id
        });
      });
    }

    return {
      committed: commit,
      diff,
      normalized,
      projections: built,
      provider: selected.provider,
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      sources: normalizationRecords.map((snapshot) => ({
        partition: snapshot.meta.partition,
        snapshotId: snapshot.meta.snapshotId,
        source: snapshot.meta.source
      })),
      syncRunId: selected.syncRunId
    };
  }
}

function sameJson(left: JsonValue, right: JsonValue) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Readonly<Record<string, JsonValue>>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
