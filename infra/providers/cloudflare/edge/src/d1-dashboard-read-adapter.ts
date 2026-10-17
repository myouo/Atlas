import type {
  DashboardConfigurationReader,
  HydratedWidgetSet,
  WidgetProjectionHydrator
} from "@nivalis/application";
import type {
  DashboardSnapshot,
  DashboardSlug,
  DashboardStateKind,
  JsonObject,
  JsonValue,
  Profile,
  WidgetConfiguration,
  WidgetProjection,
  WidgetType
} from "@nivalis/domain";

import { createPortableProjectionKey } from "./projection-key";

interface DashboardRow {
  readonly avatar_url: string;
  readonly bio: string;
  readonly created_at: string;
  readonly display_name: string;
  readonly handle: string;
  readonly headline: string;
  readonly layout_json: string;
  readonly revision_id: string;
  readonly revision_number: number;
  readonly slug: DashboardSlug;
  readonly tags_json: string;
}

interface WidgetRow {
  readonly data_config_json: string;
  readonly enabled: number;
  readonly presentation_config_json: string;
  readonly provider: WidgetConfiguration["provider"];
  readonly schema_version: number;
  readonly sort_order: number;
  readonly title: string;
  readonly widget_id: string;
  readonly widget_type: WidgetType;
}

interface ProjectionRow {
  readonly data_json: string;
  readonly generated_at: string;
  readonly projection_key: string;
  readonly projection_version_id: string;
  readonly stale: number;
  readonly widget_id: string;
}

interface CalendarHistoryRow {
  readonly created_at: string;
  readonly period: "week" | "month";
  readonly range_json: string;
  readonly start_time: number;
}

interface CalendarBackfillRow {
  readonly complete: number;
  readonly period: "week" | "month";
}

export class D1DashboardConfigurationReader implements DashboardConfigurationReader {
  constructor(private readonly database: D1Database) {}

  async getCurrentBySlug(dashboardSlug: DashboardSlug, state: DashboardStateKind) {
    return this.read(dashboardSlug, state);
  }

  async getCurrentForOwner(
    ownerId: string,
    dashboardSlug: DashboardSlug,
    state: DashboardStateKind
  ) {
    return this.read(dashboardSlug, state, ownerId);
  }

  private async read(
    dashboardSlug: DashboardSlug,
    state: DashboardStateKind,
    ownerId?: string
  ): Promise<DashboardSnapshot | null> {
    const pointer =
      state === "draft" ? "current_draft_revision_id" : "current_published_revision_id";
    const ownerPredicate = ownerId ? " AND dashboard.owner_id = ?" : "";
    const statement = this.database.prepare(
      `SELECT dashboard.slug,
              revision.id AS revision_id,
              revision.revision_number,
              revision.layout_json,
              revision.created_at,
              profile.display_name,
              profile.handle,
              profile.headline,
              profile.bio,
              profile.avatar_url,
              profile.tags_json
         FROM dashboards AS dashboard
         JOIN dashboard_revisions AS revision ON revision.id = dashboard.${pointer}
         JOIN profiles AS profile ON profile.id = dashboard.profile_id
        WHERE dashboard.slug = ?${ownerPredicate}`
    );
    const row = await (ownerId
      ? statement.bind(dashboardSlug, ownerId).first<DashboardRow>()
      : statement.bind(dashboardSlug).first<DashboardRow>());
    if (!row) return null;

    const widgets = await this.database
      .prepare(
        `SELECT widget_id,
                widget_type,
                provider,
                schema_version,
                title,
                enabled,
                data_config_json,
                presentation_config_json,
                sort_order
           FROM dashboard_revision_widgets
          WHERE revision_id = ?
          ORDER BY sort_order ASC`
      )
      .bind(row.revision_id)
      .all<WidgetRow>();

    return {
      dashboardId: row.slug,
      layout: parseJson(row.layout_json),
      profile: profileFromRow(row),
      revision: row.revision_number,
      revisionId: row.revision_id,
      state,
      updatedAt: new Date(row.created_at),
      widgets: widgets.results.map(configurationFromRow)
    };
  }
}

export class D1WidgetProjectionHydrator implements WidgetProjectionHydrator {
  constructor(private readonly database: D1Database) {}

  async hydrateWidgets(
    configurations: readonly WidgetConfiguration[],
    profile: Profile,
    fallbackAt: Date
  ): Promise<HydratedWidgetSet> {
    if (configurations.length === 0) {
      return { generatedAt: fallbackAt, versions: [], widgets: [] };
    }
    const placeholders = configurations.map(() => "?").join(", ");
    const result = await this.database
      .prepare(
        `SELECT widget_id,
                projection_key,
                projection_version_id,
                data_json,
                stale,
                generated_at
           FROM widget_projections
          WHERE widget_id IN (${placeholders})`
      )
      .bind(...configurations.map((configuration) => configuration.id))
      .all<ProjectionRow>();
    const rows = new Map(
      result.results.map((row) => [`${row.widget_id}:${row.projection_key}`, row])
    );
    const keys = await Promise.all(configurations.map(createPortableProjectionKey));
    const calendarHistory = new Map<string, readonly CalendarHistoryRow[]>();
    const calendarBackfill = new Map<string, readonly CalendarBackfillRow[]>();
    for (const configuration of configurations) {
      if (configuration.type !== "music.netease.calendar") continue;
      const history = await this.database
        .prepare(
          `SELECT history.period, history.range_json, history.start_time, history.created_at
             FROM netease_calendar_history AS history
             JOIN provider_connections AS connection
               ON connection.id = history.provider_connection_id
             JOIN dashboards AS dashboard ON dashboard.owner_id = connection.owner_id
             JOIN widgets AS widget ON widget.dashboard_id = dashboard.id
            WHERE widget.id = ?
            ORDER BY history.start_time DESC`
        )
        .bind(configuration.id)
        .all<CalendarHistoryRow>();
      calendarHistory.set(configuration.id, history.results);
      const backfill = await this.database
        .prepare(
          `SELECT state.period, state.complete
             FROM netease_calendar_backfill AS state
             JOIN provider_connections AS connection
               ON connection.id = state.provider_connection_id
             JOIN dashboards AS dashboard ON dashboard.owner_id = connection.owner_id
             JOIN widgets AS widget ON widget.dashboard_id = dashboard.id
            WHERE widget.id = ?`
        )
        .bind(configuration.id)
        .all<CalendarBackfillRow>();
      calendarBackfill.set(configuration.id, backfill.results);
    }
    let generatedAt = fallbackAt;
    const widgets: WidgetProjection[] = [];
    const versions = configurations.map((configuration, index) => {
      const projectionKey = keys[index]!;
      const projection = rows.get(`${configuration.id}:${projectionKey}`);
      const projectionAt = projection ? new Date(projection.generated_at) : fallbackAt;
      if (projectionAt > generatedAt) generatedAt = projectionAt;
      const history = calendarHistory.get(configuration.id) ?? [];
      const backfill = calendarBackfill.get(configuration.id) ?? [];
      const historyAt = history[0]?.created_at ? new Date(history[0].created_at) : null;
      if (historyAt && historyAt > generatedAt) generatedAt = historyAt;
      const data = projection
        ? parseJson(projection.data_json)
        : fallbackData(configuration, profile);
      widgets.push({
        ...configuration,
        data:
          configuration.type === "music.netease.calendar"
            ? mergeCalendarHistory(
                data,
                history,
                backfill,
                calendarPublicRanges(configuration.dataConfig.publicRanges)
              )
            : data,
        stale: projection?.stale !== 0,
        updatedAt: projectionAt
      });
      return {
        projectionKey,
        projectionVersion: projection?.projection_version_id ?? null,
        representationVersion: `${projection?.projection_version_id ?? "missing"}:${projection?.stale ?? 1}:${history.length}:${backfill.map((row) => `${row.period}:${row.complete}`).join(",")}`,
        widgetId: configuration.id
      };
    });
    return { generatedAt, versions, widgets };
  }
}

export function mergeCalendarHistory(
  data: JsonValue,
  history: readonly CalendarHistoryRow[],
  backfill: readonly CalendarBackfillRow[],
  publicRanges: readonly ("week" | "month")[]
): JsonValue {
  if (!isObject(data)) return data;
  let merged: JsonObject = {
    ...data,
    publicRanges,
    historyBackfill: {
      monthComplete: backfill.some((row) => row.period === "month" && row.complete === 1),
      weekComplete: backfill.some((row) => row.period === "week" && row.complete === 1)
    }
  };
  for (const period of ["week", "month"] as const) {
    const field = period === "week" ? "weekHistory" : "monthHistory";
    if (!publicRanges.includes(period)) {
      merged = {
        ...merged,
        [field]: [],
        [period]: { availability: "unavailable", reason: "not_public" },
        [period === "week" ? "previousWeek" : "previousMonth"]: {
          availability: "unavailable",
          reason: "not_public"
        }
      };
      continue;
    }
    const inline = Array.isArray(data[field]) ? data[field] : [];
    const candidates = [
      ...inline,
      ...history.filter((row) => row.period === period).map((row) => parseJson(row.range_json))
    ];
    const unique = new Map<string, JsonValue>();
    for (const candidate of candidates) {
      if (!isObject(candidate) || !Array.isArray(candidate.points)) continue;
      const date = isObject(candidate.points[0]) ? candidate.points[0].date : null;
      if (typeof date !== "string") continue;
      const anchor = period === "month" ? date.slice(0, 7) : date;
      if (!unique.has(anchor)) unique.set(anchor, candidate);
    }
    const ordered = [...unique.values()].sort((left, right) => {
      const leftDate =
        isObject(left) && Array.isArray(left.points) && isObject(left.points[0])
          ? left.points[0].date
          : "";
      const rightDate =
        isObject(right) && Array.isArray(right.points) && isObject(right.points[0])
          ? right.points[0].date
          : "";
      return String(rightDate).localeCompare(String(leftDate));
    });
    merged = { ...merged, [field]: ordered };
  }
  return merged;
}

function calendarPublicRanges(value: JsonValue | undefined): readonly ("week" | "month")[] {
  if (!Array.isArray(value)) return ["week", "month"];
  const ranges = [...new Set(value.filter((item) => item === "week" || item === "month"))];
  return ranges.length ? (ranges as ("week" | "month")[]) : ["week", "month"];
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function profileFromRow(row: DashboardRow): Profile {
  return {
    avatarUrl: row.avatar_url,
    bio: row.bio,
    displayName: row.display_name,
    handle: row.handle,
    headline: row.headline,
    tags: parseJson<readonly string[]>(row.tags_json)
  };
}

function configurationFromRow(row: WidgetRow): WidgetConfiguration {
  return {
    dataConfig: parseJson<JsonObject>(row.data_config_json),
    enabled: row.enabled === 1,
    id: row.widget_id,
    presentationConfig: parseJson<JsonObject>(row.presentation_config_json),
    provider: row.provider,
    schemaVersion: row.schema_version,
    title: row.title,
    type: row.widget_type
  };
}

function parseJson<T = JsonValue>(value: string): T {
  return JSON.parse(value) as T;
}

function fallbackData(configuration: WidgetConfiguration, profile: Profile): JsonValue {
  if (configuration.type === "steam.profile" && configuration.schemaVersion === 2) {
    const unavailable = { availability: "unavailable", reason: "not_synced" };
    return {
      provider: "steam",
      account: unavailable,
      library: unavailable,
      recentGames: unavailable
    };
  }
  if (configuration.type === "profile.hero") return profile;
  if (configuration.type === "system.stats") {
    return { metric: "uptime_days", unit: "days", value: 0 };
  }
  if (configuration.type === "music.netease.overview" && configuration.schemaVersion === 2) {
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
  if (configuration.type === "music.netease.identity") {
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
  if (configuration.type === "music.netease.listening") {
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
  if (configuration.type === "music.netease.calendar") {
    const unavailable = { availability: "unavailable", reason: "not_synced" };
    return {
      month: unavailable,
      provider: "netease",
      publicRanges: calendarPublicRanges(configuration.dataConfig.publicRanges),
      week: unavailable
    };
  }
  if (configuration.type === "music.netease.ranking") {
    if (configuration.schemaVersion === 2) {
      const unavailable = { availability: "unavailable", reason: "not_synced" };
      return {
        allTime: unavailable,
        provider: "netease",
        publicLimit: 12,
        publicRanges: ["week", "all_time"],
        week: unavailable
      };
    }
    return {
      availability: "available",
      coverage: "provider_top_100",
      items: [],
      provider: "netease",
      publicLimit: 10,
      range: configuration.dataConfig.range === "all_time" ? "all_time" : "week",
      totalAvailable: 0
    };
  }
  if (configuration.type === "music.netease.social") {
    const hidden = { availability: "unavailable", reason: "not_public" };
    return {
      followerCount: 0,
      followersWebUrl: null,
      followers: hidden,
      following: hidden,
      followingCount: 0,
      followingWebUrl: null,
      provider: "netease",
      publicLimit: 0,
      publicLists: [],
      view: "combined",
      webUrl: null
    };
  }
  if (configuration.type === "music.netease.playlists") {
    return {
      availability: "available",
      complete: false,
      items: [],
      provider: "netease",
      providerTotal: null,
      publicLimit: 0
    };
  }
  if (configuration.type === "music.netease.showcase") {
    if (configuration.schemaVersion === 2) {
      return {
        availability: "unavailable",
        items: [],
        maxItems: 6,
        mode: "provider",
        provider: "netease",
        reason: "provider_omitted"
      };
    }
    return {
      availability: "unavailable",
      provider: "netease",
      reason: "resource_not_found",
      source: "all_time_track"
    };
  }
  return {};
}
