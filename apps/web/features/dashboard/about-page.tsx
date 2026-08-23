"use client";

import type { WidgetType } from "@nivalis/api-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { mockDashboardSource } from "../../api/mock-dashboard-source";
import { createMockWidget } from "./mock-dashboard";
import { AddWidgetDialog } from "./add-widget-dialog";
import { DashboardCanvas } from "./dashboard-canvas";
import { useDashboardStore } from "./dashboard-store";
import { EditToolbar } from "./edit-toolbar";
import { ModuleCatalog } from "./module-catalog";
import { TopActionBar } from "./top-action-bar";
import type { SyncUiState } from "./top-action-bar";
import { widgetRegistry } from "../widgets/widget-registry";

function DashboardLoading() {
  return (
    <main className="nivalis-page">
      <div className="nivalis-content">
        <div className="glass-surface h-12 w-full animate-pulse rounded-2xl" />
        <div className="mt-20 h-12 w-64 animate-pulse rounded-xl bg-white/50" />
        <div className="mt-8 h-[720px] animate-pulse rounded-[24px] bg-white/35" />
      </div>
    </main>
  );
}

export function AboutPage() {
  const query = useQuery({
    queryFn: () => mockDashboardSource.getPublicAboutDashboard(),
    queryKey: ["dashboard", "about", "phase-1-mock"]
  });
  const store = useDashboardStore();
  const initializeDashboard = store.initialize;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncUiState>("idle");
  const syncTimers = useRef<number[]>([]);

  useEffect(() => {
    if (query.data) initializeDashboard(query.data);
  }, [initializeDashboard, query.data]);

  useEffect(
    () => () => {
      syncTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

  if (query.isLoading || !query.data || !store.initialized) {
    return <DashboardLoading />;
  }

  if (query.isError || !store.draft || !store.published) {
    return (
      <main className="nivalis-page flex min-h-screen items-center justify-center p-6">
        <div className="glass-surface-strong max-w-md rounded-[24px] p-8 text-center">
          <h1 className="text-xl font-extrabold text-ink">Dashboard 暂时无法加载</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Mock Read Model 初始化失败。刷新页面后可重试。
          </p>
        </div>
      </main>
    );
  }

  const snapshot = store.mode === "edit" ? store.draft : store.published;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2_300);
  };

  const addWidget = (type: WidgetType) => {
    const definition = widgetRegistry.resolve(type, 1);
    if (!definition) return;
    const id = `${type.replaceAll(".", "-")}-${Date.now().toString(36)}`;
    store.addWidget(createMockWidget(type, id), definition.sizes);
    showNotice(`${definition.name} 已加入草稿`);
  };

  const startMockSync = () => {
    syncTimers.current.forEach((timer) => window.clearTimeout(timer));
    setSyncState("queued");
    setNotice("Mock 同步任务已进入队列");
    syncTimers.current = [
      window.setTimeout(() => setSyncState("running"), 450),
      window.setTimeout(() => {
        setSyncState("completed");
        setNotice("Mock 同步完成；未访问任何 Provider");
      }, 1_350)
    ];
  };

  return (
    <main className="nivalis-page">
      <div className="nivalis-content">
        <TopActionBar
          mode={store.mode}
          onModeChange={store.setMode}
          onSync={startMockSync}
          syncState={syncState}
        />

        {store.mode === "edit" ? (
          <div className="relative z-30 mt-3 sm:absolute sm:top-[61px] sm:right-0 sm:mt-0">
            <EditToolbar
              dirty={store.dirty}
              onAdd={() => setAddDialogOpen(true)}
              onPublish={() => {
                store.publishDraft();
                showNotice("草稿已显式发布到展示视图");
              }}
              onReset={() => {
                store.resetDraft();
                showNotice("草稿已恢复为已发布布局");
              }}
              onSave={() => {
                store.saveDraft();
                showNotice("草稿已保存到当前浏览器");
              }}
            />
          </div>
        ) : null}

        <header className="mt-9 px-1 sm:px-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[34px] leading-none font-black tracking-[-0.04em] text-ink sm:text-[38px]">
                About Me
              </h1>
              <p className="mt-2 text-sm font-extrabold text-ink sm:text-base">
                {query.data.profile.displayName}
                <span className="mx-2 text-blue-400">/</span>
                {query.data.profile.headline}
              </p>
            </div>
            <span className="glass-surface rounded-full px-3 py-1.5 text-[10px] font-bold text-blue-700">
              Phase 1 · Explicit Mock Data
            </span>
          </div>
        </header>

        <div className="mt-2">
          <DashboardCanvas
            editable={store.mode === "edit"}
            layout={snapshot.layout}
            onLayoutChange={store.updateBreakpointLayout}
            onRemoveWidget={(widgetId) => {
              store.removeWidget(widgetId);
              showNotice("模块已从草稿移除，可通过重置恢复");
            }}
            widgets={snapshot.widgets}
          />
        </div>

        {store.mode === "edit" ? (
          <ModuleCatalog
            onAdd={addWidget}
            onOpenCatalog={() => setAddDialogOpen(true)}
            widgets={snapshot.widgets}
          />
        ) : null}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 px-2 text-[10px] font-medium text-blue-900/55">
          <span>Published revision {store.published.revision} · 本地 Phase 1 原型</span>
          <span>Provider 数据获取：未启用</span>
        </footer>
      </div>

      <AddWidgetDialog
        onAdd={addWidget}
        onOpenChange={setAddDialogOpen}
        open={addDialogOpen}
        widgets={snapshot.widgets}
      />

      <div
        aria-live="polite"
        className={
          notice
            ? "glass-surface-strong fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full px-5 py-3 text-xs font-bold text-ink opacity-100 shadow-xl transition"
            : "pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full px-5 py-3 text-xs font-bold opacity-0 transition"
        }
        role="status"
      >
        {notice}
      </div>
    </main>
  );
}
