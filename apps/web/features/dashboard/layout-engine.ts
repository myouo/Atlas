import type { ResponsiveLayout, WidgetProjection } from "@nivalis/api-client";

export const breakpointColumns = { lg: 12, md: 8, sm: 4 } as const;
export type DashboardBreakpoint = keyof typeof breakpointColumns;
export type DashboardLayoutItem = ResponsiveLayout[DashboardBreakpoint][number];

export interface WidgetGridSize {
  readonly h: number;
  readonly minH: number;
  readonly minW: number;
  readonly w: number;
}

export type WidgetGridSizes = Record<DashboardBreakpoint, WidgetGridSize>;

function intersects(a: DashboardLayoutItem, b: DashboardLayoutItem) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function overlapArea(a: DashboardLayoutItem, b: DashboardLayoutItem) {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return width * height;
}

export function findFirstGap(
  layout: readonly DashboardLayoutItem[],
  requestedWidth: number,
  requestedHeight: number,
  columns: number
): Pick<DashboardLayoutItem, "x" | "y"> {
  const width = Math.min(requestedWidth, columns);
  const searchRows = Math.max(1, ...layout.map((item) => item.y + item.h)) + requestedHeight + 8;

  for (let y = 0; y <= searchRows; y += 1) {
    for (let x = 0; x <= columns - width; x += 1) {
      const candidate = { i: "candidate", x, y, w: width, h: requestedHeight };
      if (layout.every((item) => !intersects(candidate, item))) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: searchRows };
}

export function addWidgetToLayouts(
  layouts: ResponsiveLayout,
  widgetId: string,
  sizes: WidgetGridSizes
): ResponsiveLayout {
  return Object.fromEntries(
    (Object.keys(breakpointColumns) as DashboardBreakpoint[]).map((breakpoint) => {
      const layout = layouts[breakpoint];
      const size = sizes[breakpoint];
      const position = findFirstGap(layout, size.w, size.h, breakpointColumns[breakpoint]);
      return [
        breakpoint,
        [
          ...layout,
          {
            i: widgetId,
            x: position.x,
            y: position.y,
            w: Math.min(size.w, breakpointColumns[breakpoint]),
            h: size.h
          }
        ]
      ];
    })
  ) as unknown as ResponsiveLayout;
}

export function compactLayout(layout: readonly DashboardLayoutItem[]): DashboardLayoutItem[] {
  const compacted: DashboardLayoutItem[] = [];
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const source of sorted) {
    let next = { ...source };
    while (next.y > 0) {
      const candidate = { ...next, y: next.y - 1 };
      if (compacted.some((item) => intersects(candidate, item))) {
        break;
      }
      next = candidate;
    }
    compacted.push(next);
  }

  return compacted;
}

export function settleInteractiveLayout(
  layout: readonly DashboardLayoutItem[],
  movedId: string,
  origin: Pick<DashboardLayoutItem, "x" | "y"> | null,
  columns: number
): DashboardLayoutItem[] {
  const cloned = layout.map((item) => ({ ...item }));
  const moved = cloned.find((item) => item.i === movedId);
  if (!moved) return cloned;
  const collisions = cloned
    .filter((item) => item.i !== movedId && intersects(item, moved))
    .sort((left, right) => overlapArea(right, moved) - overlapArea(left, moved));
  if (collisions.length === 0) return cloned;

  const collisionIds = new Set(collisions.map((item) => item.i));
  const placed = cloned.filter((item) => item.i === movedId || !collisionIds.has(item.i));
  const settled = new Map(placed.map((item) => [item.i, item]));

  collisions.forEach((item, index) => {
    const preferred = index === 0 && origin ? origin : item;
    const position = findNearestAvailablePosition(item, preferred, placed, columns);
    const next = { ...item, ...position };
    placed.push(next);
    settled.set(next.i, next);
  });

  return cloned.map((item) => settled.get(item.i) ?? item);
}

function findNearestAvailablePosition(
  item: DashboardLayoutItem,
  preferred: Pick<DashboardLayoutItem, "x" | "y">,
  placed: readonly DashboardLayoutItem[],
  columns: number
) {
  const width = Math.min(item.w, columns);
  const maxY = Math.max(
    preferred.y + item.h + 12,
    ...placed.map((candidate) => candidate.y + candidate.h + 8)
  );
  let best: { readonly score: number; readonly x: number; readonly y: number } | null = null;
  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x <= columns - width; x += 1) {
      const candidate = { ...item, w: width, x, y };
      if (placed.some((existing) => intersects(candidate, existing))) continue;
      const score = Math.abs(y - preferred.y) * (columns + 1) + Math.abs(x - preferred.x);
      if (!best || score < best.score) best = { score, x, y };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: 0, y: maxY + 1 };
}

export function removeWidgetFromLayouts(
  layouts: ResponsiveLayout,
  widgetId: string
): ResponsiveLayout {
  return Object.fromEntries(
    (Object.keys(breakpointColumns) as DashboardBreakpoint[]).map((breakpoint) => [
      breakpoint,
      compactLayout(layouts[breakpoint].filter((item) => item.i !== widgetId))
    ])
  ) as unknown as ResponsiveLayout;
}

export function stripUnknownLayoutItems(
  layouts: ResponsiveLayout,
  widgets: readonly WidgetProjection[]
): ResponsiveLayout {
  const ids = new Set(widgets.map((widget) => widget.id));
  return Object.fromEntries(
    (Object.keys(breakpointColumns) as DashboardBreakpoint[]).map((breakpoint) => [
      breakpoint,
      layouts[breakpoint]
        .filter((item) => ids.has(item.i))
        .map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
    ])
  ) as unknown as ResponsiveLayout;
}

export function createSmartLayout(
  widgetIds: readonly string[],
  breakpoint: DashboardBreakpoint
): DashboardLayoutItem[] {
  const columns = breakpointColumns[breakpoint];
  if (widgetIds.length === 0) return [];
  if (widgetIds.length === 1)
    return [{ i: widgetIds[0] ?? "widget", x: 0, y: 0, w: columns, h: 3 }];
  if (widgetIds.length === 2) {
    const half = Math.floor(columns / 2);
    return widgetIds.map((id, index) => ({ i: id, x: index * half, y: 0, w: half, h: 3 }));
  }
  if (widgetIds.length === 3) {
    const side = Math.max(1, Math.floor(columns / 4));
    return [
      { i: widgetIds[0] ?? "widget-0", x: 0, y: 0, w: columns - side * 2, h: 4 },
      { i: widgetIds[1] ?? "widget-1", x: columns - side * 2, y: 0, w: side, h: 4 },
      { i: widgetIds[2] ?? "widget-2", x: columns - side, y: 0, w: side, h: 4 }
    ];
  }

  return widgetIds.reduce<DashboardLayoutItem[]>((layout, id) => {
    const width = breakpoint === "sm" ? columns : Math.max(2, Math.floor(columns / 2));
    const position = findFirstGap(layout, width, 3, columns);
    return [...layout, { i: id, ...position, w: width, h: 3 }];
  }, []);
}
