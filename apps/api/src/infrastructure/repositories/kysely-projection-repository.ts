import type { HydratedWidgetSet, ProjectionRepository } from "@nivalis/application";
import type {
  JsonObject,
  JsonValue,
  Profile,
  ProjectionTarget,
  ProviderConnection,
  StoredWidgetProjection,
  WidgetConfiguration,
  WidgetProjection,
  WidgetType
} from "@nivalis/domain";
import { type Kysely, type Transaction } from "kysely";

import type { Database } from "../database/schema";
import { createProjectionKey } from "../projections/projection-key";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export class KyselyProjectionRepository implements ProjectionRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async hydrateWidgets(
    configurations: readonly WidgetConfiguration[],
    profile: Profile,
    fallbackAt: Date
  ): Promise<HydratedWidgetSet> {
    const widgetIds = [...new Set(configurations.map((widget) => widget.id))];
    const rows =
      widgetIds.length === 0
        ? []
        : await this.database
            .selectFrom("widget_projections")
            .leftJoin(
              "provider_sync_states",
              "provider_sync_states.provider_connection_id",
              "widget_projections.provider_connection_id"
            )
            .leftJoin(
              "provider_connections",
              "provider_connections.id",
              "widget_projections.provider_connection_id"
            )
            .select([
              "widget_projections.widget_id",
              "widget_projections.projection_key",
              "widget_projections.projection_version_id",
              "widget_projections.data",
              "widget_projections.provider",
              "widget_projections.stale",
              "widget_projections.generated_at",
              "provider_sync_states.status as sync_status",
              "provider_sync_states.last_attempt_at as sync_last_attempt_at",
              "provider_sync_states.last_success_at as sync_last_success_at",
              "provider_connections.enabled as connection_enabled"
            ])
            .where("widget_projections.widget_id", "in", widgetIds)
            .execute();
    const byIdentity = new Map(
      rows.map((row) => [`${row.widget_id}:${row.projection_key.trim()}`, row])
    );
    let generatedAt = fallbackAt;
    const versions = configurations.map((configuration) => {
      const projectionKey = createProjectionKey(configuration);
      const projection = byIdentity.get(`${configuration.id}:${projectionKey}`);
      if (projection && projection.generated_at > generatedAt)
        generatedAt = projection.generated_at;
      return {
        projectionKey,
        projectionVersion: projection?.projection_version_id ?? null,
        representationVersion: [
          projection?.projection_version_id ?? "missing",
          effectiveStale(projection)
        ].join(":"),
        widgetId: configuration.id
      };
    });
    const widgets = configurations.map((configuration, index): WidgetProjection => {
      const version = versions[index]!;
      const projection = byIdentity.get(`${configuration.id}:${version.projectionKey}`);
      return {
        ...configuration,
        data: projection?.data ?? fallbackData(configuration, profile),
        stale: effectiveStale(projection),
        updatedAt: projection?.generated_at ?? fallbackAt
      };
    });
    return { generatedAt, versions, widgets };
  }

  async listActiveTargets(connection: ProviderConnection): Promise<readonly ProjectionTarget[]> {
    const rows = await this.database
      .selectFrom("dashboard_revision_widgets as snapshot")
      .innerJoin("dashboards as dashboard", "dashboard.id", "snapshot.dashboard_id")
      .select([
        "snapshot.widget_id",
        "snapshot.widget_type",
        "snapshot.provider",
        "snapshot.schema_version",
        "snapshot.title",
        "snapshot.data_config",
        "snapshot.presentation_config",
        "snapshot.enabled"
      ])
      .where("dashboard.owner_id", "=", connection.ownerId)
      .where("snapshot.provider", "=", connection.provider)
      .where((expression) =>
        expression.or([
          expression(
            "snapshot.revision_id",
            "=",
            expression.ref("dashboard.current_draft_revision_id")
          ),
          expression(
            "snapshot.revision_id",
            "=",
            expression.ref("dashboard.current_published_revision_id")
          )
        ])
      )
      .execute();
    const targets = new Map<string, ProjectionTarget>();
    for (const row of rows) {
      const type = row.widget_type as WidgetType;
      const target: ProjectionTarget = {
        dataConfig: row.data_config as JsonObject,
        enabled: row.enabled,
        id: row.widget_id,
        presentationConfig: row.presentation_config as JsonObject,
        projectionKey: createProjectionKey({
          dataConfig: row.data_config as JsonObject,
          schemaVersion: row.schema_version,
          type
        }),
        provider: row.provider,
        schemaVersion: row.schema_version,
        title: row.title,
        type
      };
      targets.set(`${target.id}:${target.projectionKey}`, target);
    }
    return [...targets.values()];
  }

  async getStoredProjections(
    targets: readonly ProjectionTarget[]
  ): Promise<readonly StoredWidgetProjection[]> {
    if (targets.length === 0) return [];
    const expected = new Set(targets.map((target) => `${target.id}:${target.projectionKey}`));
    const rows = await this.database
      .selectFrom("widget_projections")
      .selectAll()
      .where("widget_id", "in", [...new Set(targets.map((target) => target.id))])
      .execute();
    return rows
      .filter((row) => expected.has(`${row.widget_id}:${row.projection_key.trim()}`))
      .map((row) => ({
        data: row.data,
        generatedAt: row.generated_at,
        lastSuccessAt: row.last_success_at,
        projectionKey: row.projection_key.trim(),
        projectionSchemaVersion: row.projection_schema_version,
        projectionVersionId: row.projection_version_id,
        provider: row.provider,
        providerConnectionId: row.provider_connection_id,
        sourceSnapshotId: row.source_snapshot_id,
        stale: row.stale,
        widgetId: row.widget_id
      }));
  }
}

function effectiveStale(
  projection:
    | {
        readonly stale: boolean;
        readonly connection_enabled: boolean | null;
        readonly provider: string;
        readonly sync_last_attempt_at: Date | null;
        readonly sync_last_success_at: Date | null;
        readonly sync_status: string | null;
      }
    | undefined
) {
  if (!projection || projection.stale) return true;
  if (projection.provider !== "fixture" && projection.connection_enabled !== true) return true;
  if (projection.sync_status === "failed" || projection.sync_status === "retry_wait") return true;
  if (projection.sync_status === "queued" || projection.sync_status === "running") {
    return (
      projection.sync_last_success_at === null ||
      (projection.sync_last_attempt_at !== null &&
        projection.sync_last_attempt_at > projection.sync_last_success_at)
    );
  }
  return false;
}

function fallbackData(configuration: WidgetConfiguration, profile: Profile): JsonValue {
  switch (configuration.type) {
    case "profile.hero":
      return profile;
    case "system.stats":
      return fallbackSystemStat(configuration.title);
    case "music.netease.overview":
      if (configuration.schemaVersion === 2) {
        const unavailable = { availability: "unavailable", reason: "not_synced" };
        return {
          account: unavailable,
          listeningDuration: unavailable,
          provider: "netease",
          recentListening: unavailable,
          totalListenCount: unavailable,
          trend: unavailable,
          weeklyListening: unavailable
        };
      }
      return {
        change: 0,
        dailyAverage: 0,
        genres: [],
        minutes: 0,
        plays: 0,
        range: projectionRange(configuration.dataConfig),
        topArtists: [],
        trend: []
      };
    case "music.netease.identity": {
      const unavailable = { availability: "unavailable", reason: "not_synced" };
      return {
        medals: unavailable,
        profile: { availability: "available" },
        provider: "netease",
        publicFields: [],
        socialStatus: unavailable,
        vip: unavailable
      };
    }
    case "music.netease.listening": {
      const unavailable = { availability: "unavailable", reason: "not_synced" };
      return {
        provider: "netease",
        publicFields: [],
        totalListenCount: unavailable,
        totalListeningDuration: unavailable,
        trend: unavailable,
        weeklyListeningDuration: unavailable
      };
    }
    case "music.netease.ranking":
      return {
        availability: "available",
        coverage: "provider_top_100",
        items: [],
        provider: "netease",
        publicLimit: 10,
        range: configuration.dataConfig.range === "all_time" ? "all_time" : "week",
        totalAvailable: 0
      };
    case "music.netease.social": {
      const hidden = { availability: "unavailable", reason: "not_public" };
      return {
        followerCount: 0,
        followers: hidden,
        following: hidden,
        followingCount: 0,
        provider: "netease",
        publicLimit: 0,
        publicLists: []
      };
    }
    case "music.netease.playlists":
      return {
        availability: "available",
        complete: false,
        items: [],
        provider: "netease",
        providerTotal: null,
        publicLimit: 0
      };
    case "music.netease.showcase":
      return {
        availability: "unavailable",
        provider: "netease",
        reason: "resource_not_found",
        source: "all_time_track"
      };
    case "github.profile":
      return { contributions: 0, followers: 0, handle: "@not-synced", repositories: 0, stars: 0 };
    case "bilibili.profile":
      return { followers: 0, following: 0, level: 0, likes: 0, views: 0 };
    case "steam.profile":
      return { achievements: 0, games: 0, level: 0, playtimeHours: 0, screenshots: 0 };
    case "bangumi.collection":
      return { entries: 0, level: 0, reviews: 0, watched: 0, watching: 0 };
  }
}

function projectionRange(config: JsonObject): "7d" | "30d" | "year" {
  return config.range === "30d" || config.range === "year" ? config.range : "7d";
}

function fallbackSystemStat(title: string): JsonValue {
  if (title.includes("平台")) return { metric: "providers_connected", unit: "providers", value: 0 };
  if (title.includes("同步")) return { metric: "sync_completeness", unit: "percent", value: 0 };
  if (title.includes("数据")) return { metric: "records_collected", unit: "records", value: 0 };
  return { metric: "uptime_days", unit: "days", value: 0 };
}
