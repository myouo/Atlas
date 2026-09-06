import type { ProviderCredentialResolver } from "@nivalis/application";
import {
  materializeProviderLineage,
  providerNormalizedSchemaId,
  providerProtocolMetadata,
  providerSourceSchemaId,
  ProviderCredentialError,
  ProjectionError,
  ProviderSchemaMismatchError
} from "@nivalis/domain";
import type {
  JsonObject,
  NormalizedProviderData,
  ProviderCollection,
  ProviderConnector,
  ProviderNormalizationInput,
  ProviderProjectionBatch,
  ProviderProjectionInput,
  ProviderRuntimeManifest,
  ProviderRuntimeModule,
  ProviderSyncRequest,
  SteamNormalizedData,
  SteamProfileData
} from "@nivalis/domain";
import { SteamClient } from "./steam-client";
import { parseSteamAccountReference, isSteamId64 } from "@nivalis/domain";
import { collectAchievements, STEAM_ACHIEVEMENT_BUDGET } from "./steam-achievements";
import {
  normalizeSteam,
  object,
  sanitizeGames,
  sanitizeBadges,
  sanitizeLevel,
  sanitizeProfile,
  unavailable
} from "./steam-data";

export const STEAM_PROVIDER_MANIFEST = {
  data: {
    displayName: "Steam",
    extensions: {},
    capabilities: {
      collectionModes: ["snapshot"],
      continuation: false,
      partialResults: true,
      payloadKinds: ["json"]
    },
    limits: {
      maxBatchBytes: 16_000_000,
      maxBatchRecords: 6,
      maxCacheRecords: 0,
      maxCheckpointBytes: 1024,
      maxCollectionBytes: 16_000_000,
      maxContinuationBatches: 1,
      maxIssues: 6,
      maxNormalizedBytes: 16_000_000,
      maxProjectionBytes: 1_000_000,
      maxRecordBytes: 5_000_000
    },
    normalizedSchema: {
      acceptedVersions: [1, 2],
      id: providerNormalizedSchemaId("steam"),
      producedVersion: 2
    },
    sources: [
      "steam.profile",
      "steam.library",
      "steam.recent",
      "steam.level",
      "steam.badges",
      "steam.achievements"
    ].map((id) => ({
      id,
      criticality:
        id === "steam.badges" || id === "steam.achievements"
          ? ("optional" as const)
          : ("required" as const),
      dataShape: "document" as const,
      extensions: {},
      mediaTypes: ["application/json"],
      operations: ["replace" as const],
      partitions: ["singleton" as const],
      payloadKinds: ["json" as const],
      schema: {
        acceptedVersions: sourceVersion(id) === 1 ? [1] : [1, 2],
        id: providerSourceSchemaId("steam", id),
        producedVersion: sourceVersion(id)
      }
    }))
  },
  meta: providerProtocolMetadata("manifest", "steam")
} satisfies ProviderRuntimeManifest;

export class SteamConnector implements ProviderConnector {
  constructor(
    private readonly client: SteamClient,
    private readonly credentials: ProviderCredentialResolver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async collect(request: ProviderSyncRequest): Promise<ProviderCollection> {
    let secret: { apiKey: string; steamId: string };
    try {
      const value: unknown = JSON.parse(
        await this.credentials.resolve(request.data.connectionId, "steam_web_api")
      );
      const record = object(value, "steam.credentials");
      if (
        typeof record.apiKey !== "string" ||
        !/^[a-fA-F0-9]{32}$/.test(record.apiKey) ||
        typeof record.steamId !== "string"
      )
        throw new Error();
      parseSteamAccountReference(record.steamId);
      secret = { apiKey: record.apiKey, steamId: record.steamId };
    } catch {
      throw new ProviderCredentialError("invalid");
    }
    const reference = parseSteamAccountReference(secret.steamId);
    if (reference.kind === "vanity") {
      const resolved = object(
        object(await this.client.get("vanity", reference.value, secret.apiKey), "steam.identity")
          .response,
        "steam.identity"
      );
      if (resolved.success === 42)
        throw new ProviderCredentialError(
          "invalid",
          "Steam could not resolve the profile identifier."
        );
      if (resolved.success !== 1 || !isSteamId64(resolved.steamid))
        throw new ProviderSchemaMismatchError("steam.identity");
      secret.steamId = resolved.steamid;
    } else secret.steamId = reference.value;
    const account = sanitizeProfile(
      await this.client.get("profile", secret.steamId, secret.apiKey),
      secret.steamId
    );
    const isPrivate = account.communityvisibilitystate !== 3;
    const [library, recent, level, badges] = isPrivate
      ? [
          unavailable("private"),
          unavailable("private"),
          { player_level: null },
          unavailable("private")
        ]
      : await parallelReads([
          () =>
            this.client
              .get("library", secret.steamId, secret.apiKey)
              .then((value) => sanitizeGames(value, "library")),
          () =>
            this.client
              .get("recent", secret.steamId, secret.apiKey)
              .then((value) => sanitizeGames(value, "recent")),
          () => this.client.get("level", secret.steamId, secret.apiKey).then(sanitizeLevel),
          () => this.client.get("badges", secret.steamId, secret.apiKey).then(sanitizeBadges)
        ]);
    const achievements = isPrivate
      ? {
          scope: "recent_and_most_played",
          requestBudget: STEAM_ACHIEVEMENT_BUDGET,
          candidateCount: null,
          games: []
        }
      : await collectAchievements(this.client, secret.steamId, secret.apiKey, library!, recent!);
    const payloads: [string, JsonObject][] = [
      ["steam.profile", account],
      ["steam.library", library!],
      ["steam.recent", recent!],
      ["steam.level", level!],
      ["steam.badges", badges!],
      ["steam.achievements", achievements]
    ];
    const issues = payloads
      .filter(
        ([source, data]) =>
          data.availability === "unavailable" ||
          (source === "steam.achievements" &&
            (data.candidateCount === null ||
              (Array.isArray(data.games) &&
                (data.games.length !== data.candidateCount ||
                  data.games.some(
                    (game) =>
                      game &&
                      typeof game === "object" &&
                      !Array.isArray(game) &&
                      game.availability === "unavailable"
                  )))))
      )
      .map(([source]) => ({
        code:
          source === "steam.achievements"
            ? "steam-achievement-coverage-partial"
            : "steam-data-unavailable",
        message:
          source === "steam.achievements"
            ? "Achievement coverage is bounded; some games are deferred or unavailable."
            : "Steam did not expose this data; check profile and game-details visibility.",
        partition: { kind: "singleton" as const },
        retryable: false,
        severity: "warning" as const,
        source
      }));
    const records = payloads.map(([source, data]) => {
      if (JSON.stringify(data).toLowerCase().includes(secret.apiKey.toLowerCase()))
        throw new ProviderSchemaMismatchError(source);
      return {
        data,
        meta: {
          ...providerProtocolMetadata("source.record", "steam", request.data.runId),
          collectedAt: this.now().toISOString(),
          mediaType: "application/json",
          operation: "replace" as const,
          partition: { kind: "singleton" as const },
          payloadKind: "json" as const,
          schemaId: providerSourceSchemaId("steam", source),
          schemaVersion: sourceVersion(source),
          source,
          sourceUpdatedAt: null
        }
      };
    });
    return {
      data: {
        checkpoint: null,
        continuation: null,
        issues,
        mode: "snapshot",
        outcome: issues.length ? "partial" : "complete",
        records
      },
      meta: providerProtocolMetadata("collection.result", "steam", request.data.runId)
    };
  }
}

export class SteamNormalizer {
  async normalize(input: ProviderNormalizationInput): Promise<NormalizedProviderData> {
    const data = normalizeSteam(
      new Map(input.data.records.map((record) => [record.meta.source, record.data])),
      input.data.records.find((record) => record.meta.source === "steam.recent")?.meta
        .schemaVersion ?? 1
    );
    return {
      data,
      meta: {
        ...providerProtocolMetadata("normalization.result", "steam", input.meta.correlationId),
        checkpoint: input.data.checkpoint,
        issues: input.data.issues,
        outcome: input.data.collectionOutcome,
        schemaId: providerNormalizedSchemaId("steam"),
        schemaVersion: 2,
        sourceSnapshots: materializeProviderLineage(input)
      }
    };
  }
}

export class SteamProjector {
  async project(input: ProviderProjectionInput): Promise<ProviderProjectionBatch> {
    const payload = input.data.normalized.data as SteamNormalizedData;
    if (
      payload.provider !== "steam" ||
      !payload.account ||
      payload.account.availability !== "available"
    )
      throw new ProjectionError("Invalid Steam normalized data.");
    const sourceSnapshotId = input.data.normalized.meta.sourceSnapshots[0]?.snapshotId;
    if (!sourceSnapshotId) throw new ProjectionError("Steam source lineage is missing.");
    return {
      data: input.data.targets.map((target) => {
        if (
          target.provider !== "steam" ||
          target.type !== "steam.profile" ||
          target.schemaVersion !== 2
        )
          throw new ProjectionError("Unsupported Steam widget target.");
        if (
          Object.entries(target.dataConfig).some(
            ([key, value]) =>
              !["shareProfile", "shareLibrary", "shareRecentGames"].includes(key) ||
              typeof value !== "boolean"
          )
        )
          throw new ProjectionError("Invalid Steam disclosure configuration.");
        const library =
          payload.library.availability === "available"
            ? {
                availability: "available" as const,
                gameCount: payload.library.gameCount,
                playtimeMinutes: payload.library.playtimeMinutes,
                playedGameCount: payload.library.playedGameCount
              }
            : payload.library;
        const data: SteamProfileData = {
          provider: "steam",
          account:
            target.dataConfig.shareProfile === false ? unavailable("not_shared") : payload.account,
          library: target.dataConfig.shareLibrary === false ? unavailable("not_shared") : library,
          recentGames:
            target.dataConfig.shareRecentGames === true
              ? payload.recentGames.availability === "available"
                ? {
                    availability: "available",
                    totalCount: payload.recentGames.totalCount,
                    items: payload.recentGames.items.slice(0, 6).map((game) => ({
                      appId: game.appId,
                      name: game.name,
                      iconUrl: game.iconUrl,
                      storeUrl: game.storeUrl,
                      playtimeMinutes: game.playtimeMinutes,
                      recentPlaytimeMinutes: game.recentPlaytimeMinutes
                    }))
                  }
                : payload.recentGames
              : unavailable("not_shared")
        };
        return {
          data,
          projectionKey: target.projectionKey,
          projectionSchemaVersion: 2,
          sourceSnapshotId,
          widgetId: target.id
        };
      }),
      meta: {
        ...providerProtocolMetadata("projection.result", "steam", input.meta.correlationId),
        issues: input.data.normalized.meta.issues,
        outcome: input.data.normalized.meta.outcome
      }
    };
  }
}

function sourceVersion(source: string) {
  return source === "steam.level" || source === "steam.badges" || source === "steam.achievements"
    ? 1
    : 2;
}

async function parallelReads(tasks: readonly (() => Promise<JsonObject>)[]) {
  const results: JsonObject[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        results[index] = await tasks[index]!();
      }
    })
  );
  return results;
}

export class SteamProviderRuntime implements ProviderRuntimeModule {
  readonly manifest = STEAM_PROVIDER_MANIFEST;
  readonly connector: SteamConnector;
  readonly normalizer = new SteamNormalizer();
  readonly projector = new SteamProjector();
  constructor(
    credentials: ProviderCredentialResolver,
    options: { readonly timeoutMs?: number } = {},
    fetcher?: typeof fetch
  ) {
    this.connector = new SteamConnector(new SteamClient(options.timeoutMs, fetcher), credentials);
  }
}
