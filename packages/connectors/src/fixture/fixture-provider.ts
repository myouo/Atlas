import {
  NormalizationError,
  materializeProviderLineage,
  PermanentProviderError,
  ProjectionError,
  PROVIDER_JSON_MEDIA_TYPE,
  providerNormalizedSchemaId,
  providerProtocolMetadata,
  providerSourceSchemaId,
  RetryableProviderError
} from "@nivalis/domain";
import type {
  JsonObject,
  NormalizedProviderData,
  ProjectionTarget,
  ProviderCollection,
  ProviderConnector,
  ProviderNormalizationInput,
  ProviderNormalizer,
  ProviderProjectionBatch,
  ProviderProjectionInput,
  ProviderProjector,
  ProviderRuntimeModule,
  ProviderRuntimeManifest,
  ProviderSyncRequest
} from "@nivalis/domain";

export type FixtureScenario =
  | "success"
  | "retry_then_success"
  | "permanent_failure"
  | "normalization_failure"
  | "projection_failure";

export const FIXTURE_PROVIDER_MANIFEST = {
  data: {
    capabilities: {
      collectionModes: ["snapshot"],
      continuation: false,
      partialResults: false,
      payloadKinds: ["json"]
    },
    displayName: "Fixture",
    extensions: {},
    limits: {
      maxBatchBytes: 2_000_000,
      maxBatchRecords: 1,
      maxCacheRecords: 0,
      maxCheckpointBytes: 1_024,
      maxCollectionBytes: 2_000_000,
      maxContinuationBatches: 1,
      maxIssues: 10,
      maxNormalizedBytes: 2_000_000,
      maxProjectionBytes: 2_000_000,
      maxRecordBytes: 1_000_000
    },
    normalizedSchema: {
      acceptedVersions: [1],
      id: providerNormalizedSchemaId("fixture"),
      producedVersion: 1
    },
    sources: [
      {
        criticality: "required",
        dataShape: "mixed",
        extensions: {},
        id: "fixture.dashboard",
        mediaTypes: [PROVIDER_JSON_MEDIA_TYPE],
        operations: ["replace"],
        partitions: ["singleton"],
        payloadKinds: ["json"],
        schema: {
          acceptedVersions: [1],
          id: providerSourceSchemaId("fixture", "fixture.dashboard"),
          producedVersion: 1
        }
      }
    ]
  },
  meta: providerProtocolMetadata("manifest", "fixture")
} as const satisfies ProviderRuntimeManifest;

export class FixtureProviderRuntime implements ProviderRuntimeModule {
  readonly connector: FixtureConnector;
  readonly manifest = FIXTURE_PROVIDER_MANIFEST;
  readonly normalizer = new FixtureNormalizer();
  readonly projector = new FixtureProjector();

  constructor(
    scenario: () => FixtureScenario = () => "success",
    now: () => Date = () => new Date()
  ) {
    this.connector = new FixtureConnector(scenario, now);
  }
}

export class FixtureConnector implements ProviderConnector {
  constructor(
    private readonly scenario: () => FixtureScenario = () => "success",
    private readonly now: () => Date = () => new Date()
  ) {}

  async collect(request: ProviderSyncRequest): Promise<ProviderCollection> {
    const scenario = this.scenario();
    if (scenario === "retry_then_success" && request.data.attempt < 3) {
      throw new RetryableProviderError(
        request.data.attempt === 1 ? "Fixture timeout." : "Fixture returned HTTP 503."
      );
    }
    if (scenario === "permanent_failure") {
      throw new PermanentProviderError("Fixture returned HTTP 401.");
    }
    const payload = fixturePayload();
    return {
      data: {
        checkpoint: null,
        continuation: null,
        issues: [],
        mode: "snapshot",
        outcome: "complete",
        records: [
          {
            data:
              scenario === "normalization_failure"
                ? { kind: "invalid-fixture-payload" }
                : scenario === "projection_failure"
                  ? { ...payload, forceProjectionFailure: true }
                  : payload,
            meta: {
              ...providerProtocolMetadata("source.record", "fixture", request.data.runId),
              collectedAt: this.now().toISOString(),
              mediaType: PROVIDER_JSON_MEDIA_TYPE,
              operation: "replace",
              partition: { kind: "singleton" },
              payloadKind: "json",
              schemaId: providerSourceSchemaId("fixture", "fixture.dashboard"),
              schemaVersion: 1,
              source: "fixture.dashboard",
              sourceUpdatedAt: this.now().toISOString()
            }
          }
        ]
      },
      meta: providerProtocolMetadata("collection.result", "fixture", request.data.runId)
    };
  }
}

export class FixtureNormalizer implements ProviderNormalizer {
  async normalize(input: ProviderNormalizationInput): Promise<NormalizedProviderData> {
    const snapshots = input.data.records;
    const snapshot = snapshots.find((item) => item.meta.source === "fixture.dashboard");
    if (!snapshot) throw new NormalizationError("Fixture Raw Snapshot is missing.");
    if (!isObject(snapshot.data) || snapshot.data.kind !== "nivalis-fixture") {
      throw new NormalizationError("Fixture payload schema did not match version 1.");
    }
    return {
      data: snapshot.data,
      meta: {
        ...providerProtocolMetadata("normalization.result", "fixture", input.meta.correlationId),
        checkpoint: input.data.checkpoint,
        issues: input.data.issues,
        outcome: input.data.collectionOutcome,
        schemaId: providerNormalizedSchemaId("fixture"),
        schemaVersion: 1,
        sourceSnapshots: materializeProviderLineage(input)
      }
    };
  }
}

export class FixtureProjector implements ProviderProjector {
  async project(input: ProviderProjectionInput): Promise<ProviderProjectionBatch> {
    const { normalized, targets } = input.data;
    if (normalized.data.forceProjectionFailure === true) {
      throw new ProjectionError("Fixture projector failed intentionally.");
    }
    const sourceSnapshotId = normalized.meta.sourceSnapshots.find(
      (source) => source.source === "fixture.dashboard"
    )?.snapshotId;
    if (!sourceSnapshotId) throw new ProjectionError("Fixture source snapshot is missing.");
    return {
      data: targets.map((target) => ({
        data: projectTarget(normalized.data, target),
        projectionKey: target.projectionKey,
        projectionSchemaVersion: target.schemaVersion,
        sourceSnapshotId,
        widgetId: target.id
      })),
      meta: {
        ...providerProtocolMetadata("projection.result", "fixture", input.meta.correlationId),
        issues: normalized.meta.issues,
        outcome: normalized.meta.outcome
      }
    };
  }
}

function fixturePayload(): JsonObject {
  return {
    bangumi: { entries: 2_349, level: 5, reviews: 8, watched: 13, watching: 391 },
    bilibili: {
      followers: 1_306,
      following: 86,
      level: 6,
      likes: 2_362,
      views: 68_420
    },
    github: {
      contributions: 2_901,
      followers: 136,
      handle: "@nivalis",
      repositories: 87,
      stars: 1_291
    },
    kind: "nivalis-fixture",
    netease: {
      change: 0.16,
      dailyAverage: 286,
      genres: [
        { name: "流行", share: 0.42 },
        { name: "摇滚", share: 0.24 },
        { name: "ACG", share: 0.18 },
        { name: "电子", share: 0.09 },
        { name: "其他", share: 0.07 }
      ],
      minutes: 1_941,
      plays: 267,
      topArtists: [
        { avatarUrl: "/images/mock-avatar-artist-1.webp", name: "米津玄师" },
        { avatarUrl: "/images/mock-avatar-artist-2.webp", name: "黒羽" },
        { avatarUrl: "/images/mock-avatar-artist-3.webp", name: "Aimer" }
      ],
      trend: [
        { label: "05/15", value: 430 },
        { label: "05/16", value: 390 },
        { label: "05/17", value: 460 },
        { label: "05/18", value: 355 },
        { label: "05/19", value: 670 },
        { label: "05/20", value: 410 },
        { label: "05/21", value: 455 }
      ]
    },
    profile: {
      avatarUrl: "/images/mock-avatar-profile.webp",
      bio: "把可靠的系统边界和有温度的界面，编织成长期可维护的产品。",
      displayName: "Nivalis",
      handle: "@nivalis",
      headline: "全栈开发者 / ACG 爱好者",
      tags: ["Coding", "Music", "Photography", "Anime"]
    },
    stats: {
      providers_connected: 5,
      records_collected: 129_100,
      sync_completeness: 100,
      uptime_days: 428
    },
    steam: {
      achievements: 3_321,
      games: 126,
      level: 32,
      playtimeHours: 1_463,
      screenshots: 3_219
    }
  };
}

function projectTarget(payload: JsonObject, target: ProjectionTarget) {
  switch (target.type) {
    case "profile.hero":
      return requiredObject(payload, "profile");
    case "system.stats": {
      const metric = metricForTitle(target.title);
      const stats = requiredObject(payload, "stats");
      const value = typeof stats[metric] === "number" ? stats[metric] : 0;
      return { metric, unit: unitForMetric(metric), value };
    }
    case "music.netease.overview":
      return {
        ...requiredObject(payload, "netease"),
        range:
          target.dataConfig.range === "30d" || target.dataConfig.range === "year"
            ? target.dataConfig.range
            : "7d"
      };
    case "github.profile":
      return requiredObject(payload, "github");
    case "bilibili.profile":
      return requiredObject(payload, "bilibili");
    case "steam.profile":
      return requiredObject(payload, "steam");
    case "bangumi.collection":
      return requiredObject(payload, "bangumi");
    default:
      throw new ProjectionError(`Fixture target '${target.type}' is unsupported.`);
  }
}

function metricForTitle(title: string) {
  if (title.includes("平台")) return "providers_connected";
  if (title.includes("同步")) return "sync_completeness";
  if (title.includes("数据")) return "records_collected";
  return "uptime_days";
}

function unitForMetric(metric: string) {
  if (metric === "providers_connected") return "providers";
  if (metric === "sync_completeness") return "percent";
  if (metric === "records_collected") return "records";
  return "days";
}

function requiredObject(payload: JsonObject, key: string): JsonObject {
  const value = payload[key];
  if (!isObject(value)) throw new ProjectionError(`Fixture field '${key}' is invalid.`);
  return value;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
