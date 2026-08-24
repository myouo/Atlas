import { DASHBOARD_BREAKPOINT_COLUMNS, InvalidDashboardError } from "@nivalis/domain";
import type {
  DashboardBreakpoint,
  DashboardDraftInput,
  DashboardLayoutItem,
  WidgetType
} from "@nivalis/domain";

const supportedSchemaVersions: Record<WidgetType, readonly number[]> = {
  "profile.hero": [1],
  "system.stats": [1],
  "music.netease.overview": [1, 2],
  "github.profile": [1],
  "bilibili.profile": [1],
  "steam.profile": [1],
  "bangumi.collection": [1]
};

function validateLayoutItem(
  breakpoint: DashboardBreakpoint,
  item: DashboardLayoutItem,
  issues: string[]
) {
  const columns = DASHBOARD_BREAKPOINT_COLUMNS[breakpoint];
  if (![item.x, item.y, item.w, item.h].every(Number.isInteger)) {
    issues.push(`${breakpoint}:${item.i} must use integer x/y/w/h values.`);
  }
  if (item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1) {
    issues.push(`${breakpoint}:${item.i} has invalid position or dimensions.`);
  }
  if (item.x + item.w > columns) {
    issues.push(`${breakpoint}:${item.i} exceeds the ${columns}-column grid.`);
  }
}

export function validateDashboardDraft(input: DashboardDraftInput): void {
  const issues: string[] = [];
  const widgetIds = input.widgets.map((widget) => widget.id);
  const uniqueWidgetIds = new Set(widgetIds);

  if (uniqueWidgetIds.size !== widgetIds.length) {
    issues.push("Widget IDs must be unique within a Dashboard state.");
  }

  for (const widget of input.widgets) {
    if (!supportedSchemaVersions[widget.type]?.includes(widget.schemaVersion)) {
      issues.push(`${widget.type}@${widget.schemaVersion} is not supported.`);
    }
    if (!widget.id || !widget.title) {
      issues.push("Every Widget requires a stable ID and title.");
    }
    if (
      widget.type === "music.netease.overview" &&
      widget.schemaVersion === 2 &&
      widget.provider !== "netease"
    ) {
      issues.push("music.netease.overview@2 requires the netease Provider.");
    }
  }

  const enabledIds = new Set(
    input.widgets.filter((widget) => widget.enabled).map((widget) => widget.id)
  );

  for (const breakpoint of Object.keys(DASHBOARD_BREAKPOINT_COLUMNS) as DashboardBreakpoint[]) {
    const layout = input.layout[breakpoint];
    const layoutIds = layout.map((item) => item.i);
    const uniqueLayoutIds = new Set(layoutIds);

    if (layoutIds.length !== uniqueLayoutIds.size) {
      issues.push(`${breakpoint} layout contains duplicate Widget IDs.`);
    }

    for (const item of layout) {
      validateLayoutItem(breakpoint, item, issues);
      if (!uniqueWidgetIds.has(item.i)) {
        issues.push(`${breakpoint}:${item.i} does not reference an existing Widget.`);
      }
    }

    for (const widgetId of enabledIds) {
      if (!uniqueLayoutIds.has(widgetId)) {
        issues.push(`${breakpoint} layout is missing enabled Widget '${widgetId}'.`);
      }
    }
  }

  if (issues.length > 0) {
    throw new InvalidDashboardError(issues);
  }
}
