"use client";

import type { ResponsiveLayout, WidgetProjection } from "@nivalis/api-client";
import clsx from "clsx";
import { noCompactor, Responsive, useContainerWidth } from "react-grid-layout";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";
import { useMemo, useState } from "react";

import { WidgetCard } from "../widgets/widget-card";
import { widgetRegistry } from "../widgets/widget-registry";
import { breakpointColumns } from "./layout-engine";
import type { DashboardBreakpoint, DashboardLayoutItem } from "./layout-engine";

interface DashboardCanvasProps {
  readonly editable: boolean;
  readonly layout: ResponsiveLayout;
  readonly onLayoutChange: (breakpoint: DashboardBreakpoint, layout: DashboardLayoutItem[]) => void;
  readonly onPresentationConfigChange: (
    widgetId: string,
    config: WidgetProjection["presentationConfig"]
  ) => void;
  readonly onRemoveWidget: (widgetId: string) => void;
  readonly widgets: readonly WidgetProjection[];
}

function buildGridLayouts(layout: ResponsiveLayout, widgets: readonly WidgetProjection[]) {
  const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));
  return Object.fromEntries(
    (Object.keys(breakpointColumns) as DashboardBreakpoint[]).map((breakpoint) => [
      breakpoint,
      layout[breakpoint].map((item) => {
        const widget = widgetMap.get(item.i);
        const definition = widget
          ? widgetRegistry.resolve(widget.type, widget.schemaVersion)
          : undefined;
        const size = definition?.sizes[breakpoint];
        return {
          ...item,
          minH: size?.minH ?? 2,
          minW: Math.min(size?.minW ?? 2, breakpointColumns[breakpoint])
        };
      })
    ])
  ) as ResponsiveLayouts<DashboardBreakpoint>;
}

function stripLayout(layout: Layout): DashboardLayoutItem[] {
  return layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
}

export function DashboardCanvas({
  editable,
  layout,
  onLayoutChange,
  onPresentationConfigChange,
  onRemoveWidget,
  widgets
}: DashboardCanvasProps) {
  const { containerRef, mounted, width } = useContainerWidth({ initialWidth: 1200 });
  const [breakpoint, setBreakpoint] = useState<DashboardBreakpoint>("lg");
  const gridLayouts = useMemo(() => buildGridLayouts(layout, widgets), [layout, widgets]);

  const commitLayout = (nextLayout: Layout) => {
    if (!editable) return;
    onLayoutChange(breakpoint, stripLayout(nextLayout));
  };

  return (
    <div
      className={clsx("dashboard-grid", editable && "is-editing")}
      data-testid="dashboard-canvas"
      ref={containerRef}
    >
      {mounted ? (
        <Responsive<DashboardBreakpoint>
          autoSize
          breakpoints={{ lg: 1160, md: 720, sm: 0 }}
          cols={breakpointColumns}
          compactor={noCompactor}
          containerPadding={[0, 0]}
          dragConfig={{
            bounded: true,
            cancel: "button:not(.module-drag-handle)",
            enabled: editable,
            handle: ".module-drag-handle"
          }}
          layouts={gridLayouts}
          margin={{ lg: [12, 12], md: [12, 12], sm: [8, 8] }}
          onBreakpointChange={(nextBreakpoint) => setBreakpoint(nextBreakpoint)}
          onDragStop={commitLayout}
          onResizeStop={commitLayout}
          resizeConfig={{ enabled: editable, handles: ["se"] }}
          rowHeight={35}
          width={width}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard
                editable={editable}
                onPresentationConfigChange={(config) =>
                  onPresentationConfigChange(widget.id, config)
                }
                onRemove={() => onRemoveWidget(widget.id)}
                widget={widget}
              />
            </div>
          ))}
        </Responsive>
      ) : (
        <div
          className="min-h-[520px] animate-pulse rounded-[24px] bg-white/30"
          aria-label="正在准备 Dashboard 布局"
        />
      )}
    </div>
  );
}
