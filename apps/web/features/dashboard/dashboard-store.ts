"use client";

import type { DashboardReadModel, ResponsiveLayout, WidgetProjection } from "@nivalis/api-client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { addWidgetToLayouts, removeWidgetFromLayouts } from "./layout-engine";
import type { DashboardBreakpoint, DashboardLayoutItem, WidgetGridSizes } from "./layout-engine";

export type DashboardMode = "display" | "edit";

export interface LocalDashboardSnapshot {
  readonly layout: ResponsiveLayout;
  readonly revision: number;
  readonly widgets: WidgetProjection[];
}

interface DashboardStore {
  readonly dirty: boolean;
  readonly draft: LocalDashboardSnapshot | null;
  readonly initialized: boolean;
  readonly lastPublishedAt: string | null;
  readonly lastSavedAt: string | null;
  readonly manualOverrides: Record<DashboardBreakpoint, boolean>;
  readonly mode: DashboardMode;
  readonly published: LocalDashboardSnapshot | null;
  addWidget: (widget: WidgetProjection, sizes: WidgetGridSizes) => void;
  initialize: (dashboard: DashboardReadModel) => void;
  publishDraft: () => void;
  removeWidget: (widgetId: string) => void;
  resetDraft: () => void;
  saveDraft: () => void;
  setMode: (mode: DashboardMode) => void;
  updateBreakpointLayout: (breakpoint: DashboardBreakpoint, layout: DashboardLayoutItem[]) => void;
}

const cloneSnapshot = (snapshot: LocalDashboardSnapshot): LocalDashboardSnapshot =>
  structuredClone(snapshot);

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      dirty: false,
      draft: null,
      initialized: false,
      lastPublishedAt: null,
      lastSavedAt: null,
      manualOverrides: { lg: false, md: false, sm: false },
      mode: "display",
      published: null,
      initialize: (dashboard) => {
        if (get().initialized) return;
        const snapshot: LocalDashboardSnapshot = {
          layout: structuredClone(dashboard.layout),
          revision: dashboard.revision,
          widgets: structuredClone(dashboard.widgets)
        };
        set({ draft: cloneSnapshot(snapshot), initialized: true, published: snapshot });
      },
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
      saveDraft: () => set({ dirty: false, lastSavedAt: new Date().toISOString() }),
      publishDraft: () => {
        const draft = get().draft;
        const published = get().published;
        if (!draft || !published) return;
        const nextRevision = published.revision + 1;
        const nextPublished = cloneSnapshot({ ...draft, revision: nextRevision });
        set({
          dirty: false,
          draft: cloneSnapshot(nextPublished),
          lastPublishedAt: new Date().toISOString(),
          lastSavedAt: new Date().toISOString(),
          mode: "display",
          published: nextPublished
        });
      },
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
      name: "nivalis.dashboard.phase1.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1
    }
  )
);
