"use client";

import type {
  DashboardReadModel,
  Profile,
  ResponsiveLayout,
  WidgetProjection
} from "@nivalis/api-client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { DashboardSourceKind, HydratedDashboardState } from "../../api/dashboard-source";
import type { DashboardConcurrencyToken, RevisionConflictState } from "../../api/dashboard-source";
import { addWidgetToLayouts, removeWidgetFromLayouts } from "./layout-engine";
import type { DashboardBreakpoint, DashboardLayoutItem, WidgetGridSizes } from "./layout-engine";

export type DashboardMode = "display" | "edit";

export interface LocalDashboardSnapshot {
  readonly dashboardId: "about";
  readonly layout: ResponsiveLayout;
  readonly profile: Profile;
  readonly revision: number;
  readonly widgets: readonly WidgetProjection[];
}

interface DashboardStore {
  readonly concurrencyToken: DashboardConcurrencyToken | null;
  readonly conflict: RevisionConflictState | null;
  readonly dirty: boolean;
  readonly draft: LocalDashboardSnapshot | null;
  readonly initialized: boolean;
  readonly lastPublishedAt: string | null;
  readonly lastSavedAt: string | null;
  readonly manualOverrides: Record<DashboardBreakpoint, boolean>;
  readonly mode: DashboardMode;
  readonly published: LocalDashboardSnapshot | null;
  readonly sourceKind: DashboardSourceKind | null;
  acceptProjectionRefresh: (
    published: DashboardReadModel,
    draftWidgets: readonly WidgetProjection[]
  ) => void;
  acceptPublished: (
    published: HydratedDashboardState,
    concurrencyToken: DashboardConcurrencyToken
  ) => void;
  acceptSavedDraft: (
    draft: HydratedDashboardState,
    concurrencyToken: DashboardConcurrencyToken
  ) => void;
  addWidget: (widget: WidgetProjection, sizes: WidgetGridSizes) => void;
  clearConflict: () => void;
  initializeLocal: (
    published: DashboardReadModel,
    draft: HydratedDashboardState,
    concurrencyToken: DashboardConcurrencyToken
  ) => void;
  recordConflict: (conflict: RevisionConflictState) => void;
  removeWidget: (widgetId: string) => void;
  replaceFromRemote: (
    published: DashboardReadModel,
    draft: HydratedDashboardState,
    concurrencyToken: DashboardConcurrencyToken,
    force?: boolean
  ) => void;
  replacePublic: (published: DashboardReadModel) => void;
  resetDraft: () => void;
  setMode: (mode: DashboardMode) => void;
  updateBreakpointLayout: (breakpoint: DashboardBreakpoint, layout: DashboardLayoutItem[]) => void;
  updateWidgetPresentationConfig: (
    widgetId: string,
    config: WidgetProjection["presentationConfig"]
  ) => void;
}

const cloneSnapshot = (snapshot: LocalDashboardSnapshot): LocalDashboardSnapshot =>
  structuredClone(snapshot);

function toSnapshot(
  dashboard: DashboardReadModel | HydratedDashboardState
): LocalDashboardSnapshot {
  return {
    dashboardId: dashboard.dashboardId,
    layout: structuredClone(dashboard.layout),
    profile: structuredClone(dashboard.profile),
    revision: dashboard.revision,
    widgets: structuredClone(dashboard.widgets)
  };
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      concurrencyToken: null,
      conflict: null,
      dirty: false,
      draft: null,
      initialized: false,
      lastPublishedAt: null,
      lastSavedAt: null,
      manualOverrides: { lg: false, md: false, sm: false },
      mode: "display",
      published: null,
      sourceKind: null,
      initializeLocal: (published, draft, concurrencyToken) => {
        if (get().initialized && get().sourceKind === "mock") return;
        set({
          concurrencyToken,
          conflict: null,
          draft: toSnapshot(draft),
          initialized: true,
          published: toSnapshot(published),
          sourceKind: "mock"
        });
      },
      replaceFromRemote: (published, draft, concurrencyToken, force = false) => {
        if (get().initialized && get().dirty && !force) return;
        set({
          concurrencyToken,
          conflict: null,
          dirty: false,
          draft: toSnapshot(draft),
          initialized: true,
          published: toSnapshot(published),
          sourceKind: "api"
        });
      },
      replacePublic: (published) =>
        set({
          concurrencyToken: null,
          conflict: null,
          dirty: false,
          draft: toSnapshot(published),
          initialized: true,
          mode: "display",
          published: toSnapshot(published),
          sourceKind: "api"
        }),
      setMode: (mode) => set({ mode }),
      updateBreakpointLayout: (breakpoint, layout) => {
        const draft = get().draft;
        if (!draft) return;
        set({
          dirty: true,
          draft: {
            ...draft,
            layout: { ...draft.layout, [breakpoint]: layout }
          },
          manualOverrides: { ...get().manualOverrides, [breakpoint]: true }
        });
      },
      addWidget: (widget, sizes) => {
        const draft = get().draft;
        if (!draft) return;
        set({
          dirty: true,
          draft: {
            ...draft,
            layout: addWidgetToLayouts(draft.layout, widget.id, sizes),
            widgets: [...draft.widgets, widget]
          }
        });
      },
      removeWidget: (widgetId) => {
        const draft = get().draft;
        if (!draft) return;
        set({
          dirty: true,
          draft: {
            ...draft,
            layout: removeWidgetFromLayouts(draft.layout, widgetId),
            widgets: draft.widgets.filter((widget) => widget.id !== widgetId)
          }
        });
      },
      updateWidgetPresentationConfig: (widgetId, config) => {
        const draft = get().draft;
        if (!draft) return;
        set({
          dirty: true,
          draft: {
            ...draft,
            widgets: draft.widgets.map((widget) =>
              widget.id === widgetId
                ? ({ ...widget, presentationConfig: structuredClone(config) } as WidgetProjection)
                : widget
            )
          }
        });
      },
      acceptSavedDraft: (draft, concurrencyToken) =>
        set({
          concurrencyToken,
          conflict: null,
          dirty: false,
          draft: toSnapshot(draft),
          lastSavedAt: new Date().toISOString()
        }),
      acceptPublished: (published, concurrencyToken) =>
        set({
          concurrencyToken,
          conflict: null,
          dirty: false,
          draft: toSnapshot(published),
          lastPublishedAt: new Date().toISOString(),
          lastSavedAt: new Date().toISOString(),
          mode: "display",
          published: toSnapshot(published)
        }),
      acceptProjectionRefresh: (published, draftWidgets) => {
        const draft = get().draft;
        set({
          ...(draft ? { draft: mergeProjectionData(draft, draftWidgets) } : {}),
          published: toSnapshot(published)
        });
      },
      recordConflict: (conflict) => set({ conflict, dirty: true }),
      clearConflict: () => set({ conflict: null }),
      resetDraft: () => {
        const published = get().published;
        if (!published) return;
        set({
          dirty: false,
          draft: cloneSnapshot(published),
          manualOverrides: { lg: false, md: false, sm: false }
        });
      }
    }),
    {
      name: "nivalis.dashboard.v3",
      storage: createJSONStorage(() => localStorage),
      version: 3
    }
  )
);

function mergeProjectionData(
  snapshot: LocalDashboardSnapshot,
  projections: readonly WidgetProjection[]
): LocalDashboardSnapshot {
  return {
    ...snapshot,
    widgets: snapshot.widgets.map((widget) => {
      const projection = projections.find(
        (candidate) =>
          candidate.id === widget.id &&
          candidate.type === widget.type &&
          candidate.provider === widget.provider &&
          candidate.schemaVersion === widget.schemaVersion &&
          stableJson(candidate.dataConfig) === stableJson(widget.dataConfig)
      );
      return projection
        ? ({
            ...widget,
            data: structuredClone(projection.data),
            stale: projection.stale,
            updatedAt: projection.updatedAt
          } as WidgetProjection)
        : widget;
    })
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
