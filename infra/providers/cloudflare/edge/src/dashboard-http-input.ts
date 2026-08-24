import type {
  DashboardDraftInput,
  DashboardLayoutItem,
  JsonObject,
  ProviderType,
  ResponsiveLayout,
  WidgetConfiguration,
  WidgetType
} from "@nivalis/domain";

const PROVIDERS = new Set<ProviderType>([
  "fixture",
  "netease",
  "github",
  "bilibili",
  "steam",
  "bangumi"
]);
const WIDGET_TYPES = new Set<WidgetType>([
  "profile.hero",
  "system.stats",
  "music.netease.overview",
  "music.netease.identity",
  "music.netease.listening",
  "music.netease.ranking",
  "music.netease.social",
  "music.netease.playlists",
  "music.netease.showcase",
  "github.profile",
  "bilibili.profile",
  "steam.profile",
  "bangumi.collection"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidDashboardRequestError extends Error {
  readonly code = "invalid-request";

  constructor() {
    super("The Dashboard Draft request body is invalid.");
    this.name = "InvalidDashboardRequestError";
  }
}

export function parseDashboardDraft(body: Record<string, unknown>): DashboardDraftInput {
  assertKeys(body, ["layout", "widgets"]);
  if (!isObject(body.layout) || !Array.isArray(body.widgets) || body.widgets.length > 50) {
    throw new InvalidDashboardRequestError();
  }
  return {
    layout: parseLayout(body.layout),
    widgets: body.widgets.map(parseWidget)
  };
}

function parseLayout(value: JsonObject): ResponsiveLayout {
  assertKeys(value, ["lg", "md", "sm"]);
  return {
    lg: parseLayoutItems(value.lg),
    md: parseLayoutItems(value.md),
    sm: parseLayoutItems(value.sm)
  };
}

function parseLayoutItems(value: unknown): readonly DashboardLayoutItem[] {
  if (!Array.isArray(value) || value.length > 50) throw new InvalidDashboardRequestError();
  return value.map((item) => {
    if (!isObject(item)) throw new InvalidDashboardRequestError();
    assertKeys(item, ["h", "i", "w", "x", "y"]);
    if (typeof item.i !== "string" || ![item.x, item.y, item.w, item.h].every(Number.isInteger)) {
      throw new InvalidDashboardRequestError();
    }
    return {
      h: item.h as number,
      i: item.i,
      w: item.w as number,
      x: item.x as number,
      y: item.y as number
    };
  });
}

function parseWidget(value: unknown): WidgetConfiguration {
  if (!isObject(value)) throw new InvalidDashboardRequestError();
  assertKeys(value, [
    "dataConfig",
    "enabled",
    "id",
    "presentationConfig",
    "provider",
    "schemaVersion",
    "title",
    "type"
  ]);
  if (
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.title !== "string" ||
    value.title.trim().length === 0 ||
    typeof value.enabled !== "boolean" ||
    typeof value.provider !== "string" ||
    !PROVIDERS.has(value.provider as ProviderType) ||
    typeof value.type !== "string" ||
    !WIDGET_TYPES.has(value.type as WidgetType) ||
    !Number.isInteger(value.schemaVersion) ||
    (value.schemaVersion as number) < 1 ||
    !isObject(value.dataConfig) ||
    !isObject(value.presentationConfig)
  ) {
    throw new InvalidDashboardRequestError();
  }
  return {
    dataConfig: value.dataConfig,
    enabled: value.enabled,
    id: value.id,
    presentationConfig: value.presentationConfig,
    provider: value.provider as ProviderType,
    schemaVersion: value.schemaVersion as number,
    title: value.title,
    type: value.type as WidgetType
  };
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new InvalidDashboardRequestError();
  }
}
