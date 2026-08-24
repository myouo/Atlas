import { ProjectionError, RawSnapshotNotFoundError } from "@nivalis/domain";
import type {
  BuiltWidgetProjection,
  JsonValue,
  NormalizedProviderData,
  ProviderType
} from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { ProjectionRepository } from "../ports/projection-repository";
import type {
  ProviderRuntimeRegistry,
  SyncIdentityFactory,
  SyncUnitOfWork
} from "../ports/sync-runtime";

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
  readonly sourceKinds: readonly string[];
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
    const normalized = await runtime.normalizer.normalize(snapshots);
    const targets = await this.projections.listActiveTargets(connection);
    const built = await runtime.projector.project(normalized, targets);
    validateProjectionSet(targets, built);
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
      sourceKinds: snapshots.map((snapshot) => snapshot.sourceKind),
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

function validateProjectionSet(
  targets: readonly { readonly projectionKey: string; readonly id: string }[],
  projections: readonly { readonly projectionKey: string; readonly widgetId: string }[]
) {
  const expected = new Set(targets.map((target) => `${target.id}:${target.projectionKey}`));
  const actual = new Set(
    projections.map((projection) => `${projection.widgetId}:${projection.projectionKey}`)
  );
  if (actual.size !== projections.length || actual.size !== expected.size) {
    throw new ProjectionError("Replay projection output did not match the active target set.");
  }
  for (const key of expected) {
    if (!actual.has(key)) throw new ProjectionError("Replay omitted an active target.");
  }
}
