"use client";

import type { WidgetProjection, WidgetType } from "@nivalis/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { dashboardSource } from "../../api/dashboard-source-factory";
import type { DashboardDataSource, DashboardEditableDraft } from "../../api/dashboard-source";
import { RevisionConflictError } from "../../api/dashboard-source";
import { createMockWidget } from "./mock-dashboard";
import { AddWidgetDialog } from "./add-widget-dialog";
import { DashboardCanvas } from "./dashboard-canvas";
import { useDashboardStore } from "./dashboard-store";
import type { LocalDashboardSnapshot } from "./dashboard-store";
import { EditToolbar } from "./edit-toolbar";
import { ModuleCatalog } from "./module-catalog";
import { RevisionConflictDialog } from "./revision-conflict-dialog";
import { RevisionHistoryDialog } from "./revision-history-dialog";
import { TopActionBar } from "./top-action-bar";
import type { SyncUiState } from "./top-action-bar";
import { widgetRegistry } from "../widgets/widget-registry";

interface AboutPageProps {
  readonly source?: DashboardDataSource;
}

function DashboardLoading() {
  return (
    <main className="nivalis-page">
      <div className="nivalis-content">
        <header className="mt-9 px-1 sm:px-2">
          <h1 className="text-[34px] leading-none font-black tracking-[-0.04em] text-ink sm:text-[38px]">
            About Me
          </h1>
          <div className="mt-3 h-4 w-64 animate-pulse rounded-full bg-white/50" />
        </header>
        <div className="mt-8 h-[720px] animate-pulse rounded-[24px] bg-white/35" />
      </div>
    </main>
  );
}

export function AboutPage({ source = dashboardSource }: AboutPageProps = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => source.load(),
    queryKey: ["dashboard", "about", source.kind],
    refetchInterval: source.kind === "api" ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: source.kind === "api" ? "always" : false
  });
  const store = useDashboardStore();
  const initializeLocal = store.initializeLocal;
  const replaceFromRemote = store.replaceFromRemote;
  const replacePublic = store.replacePublic;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mockSyncState, setMockSyncState] = useState<SyncUiState>("idle");
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const completedSyncJob = useRef<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const syncTimers = useRef<number[]>([]);

  const syncJobQuery = useQuery({
    enabled: source.kind === "api" && syncJobId !== null,
    queryFn: () => source.getSyncJob(syncJobId!),
    queryKey: ["sync-job", syncJobId, source.kind],
    refetchInterval: (activeQuery) => {
      const status = activeQuery.state.data?.status;
      return status === "queued" || status === "running" || status === "retrying" ? 500 : false;
    }
  });

  const showNotice = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null;
      setNotice(null);
    }, 2_300);
  };

  const handleMutationError = (error: Error, fallback: string) => {
    if (error instanceof RevisionConflictError) {
      store.recordConflict(error);
      showNotice("检测到版本冲突；本地修改仍然保留");
      return;
    }
    showNotice(fallback);
  };

  const saveMutation = useMutation({
    mutationFn: (snapshot: LocalDashboardSnapshot) => {
      const concurrencyToken = useDashboardStore.getState().concurrencyToken;
      if (!concurrencyToken) throw new Error("Draft concurrency token is unavailable.");
      return source.saveDraft(toDraftUpdate(snapshot), concurrencyToken);
    },
    onError: (error) => handleMutationError(error, "保存失败；当前本地草稿已保留，可稍后重试"),
    onSuccess: (saved) => {
      store.acceptSavedDraft(saved.dashboard, saved.concurrencyToken);
      showNotice(source.kind === "api" ? "草稿已保存到服务端持久化存储" : "草稿已保存到当前浏览器");
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "about", source.kind] });
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "about", "revisions", source.kind]
      });
    }
  });

  const publishMutation = useMutation({
    mutationFn: async (snapshot: LocalDashboardSnapshot) => {
      const state = useDashboardStore.getState();
      let concurrencyToken = state.concurrencyToken;
      if (!concurrencyToken) throw new Error("Draft concurrency token is unavailable.");
      const input = toDraftUpdate(snapshot);
      if (state.dirty) {
        const saved = await source.saveDraft(input, concurrencyToken);
        useDashboardStore.getState().acceptSavedDraft(saved.dashboard, saved.concurrencyToken);
        concurrencyToken = saved.concurrencyToken;
      }
      return source.publishDraft(input, concurrencyToken);
    },
    onError: (error) => handleMutationError(error, "发布失败；当前本地草稿未丢失"),
    onSuccess: (published) => {
      store.acceptPublished(published.dashboard, published.concurrencyToken);
      showNotice("草稿已显式发布到展示视图");
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "about", source.kind] });
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "about", "revisions", source.kind]
      });
    }
  });

  const restoreMutation = useMutation({
    mutationFn: (revisionId: string) => {
      const concurrencyToken = useDashboardStore.getState().concurrencyToken;
      if (!concurrencyToken) throw new Error("Draft concurrency token is unavailable.");
      return source.restoreRevision(revisionId, concurrencyToken);
    },
    onError: (error) => {
      setHistoryOpen(false);
      handleMutationError(error, "历史版本恢复失败；当前草稿未改变");
    },
    onSuccess: (restored) => {
      store.acceptSavedDraft(restored.dashboard, restored.concurrencyToken);
      setHistoryOpen(false);
      showNotice(`已创建恢复后的新草稿 Revision ${restored.dashboard.revision}`);
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "about", source.kind] });
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "about", "revisions", source.kind]
      });
    }
  });

  const reloadMutation = useMutation({
    mutationFn: () => source.load(),
    onError: () => showNotice("服务器版本暂时无法加载；本地修改仍保留"),
    onSuccess: (loaded) => {
      if (!loaded.draft) {
        store.replacePublic(loaded.published);
        showNotice("当前 Session 不具备 Owner 权限");
        return;
      }
      store.replaceFromRemote(
        loaded.published,
        loaded.draft.dashboard,
        loaded.draft.concurrencyToken,
        true
      );
      showNotice("已按你的选择加载服务器最新草稿");
    }
  });

  const startAuthenticationMutation = useMutation({
    mutationFn: () => source.startAuthentication(),
    onError: () => showNotice("暂时无法开始 GitHub 登录"),
    onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl)
  });

  const logoutMutation = useMutation({
    mutationFn: () => source.logout(),
    onError: () => showNotice("退出登录失败"),
    onSuccess: () => {
      useDashboardStore.getState().setMode("display");
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "about", source.kind] });
    }
  });

  const refreshProjectionMutation = useMutation({
    mutationFn: () => source.refreshProjections(),
    onError: () => showNotice("同步已完成，但最新 Projection 暂时无法读取"),
    onSuccess: (refreshed) => {
      store.acceptProjectionRefresh(refreshed.published, refreshed.draftWidgets);
      queryClient.setQueryData(
        ["dashboard", "about", source.kind],
        (loaded: Awaited<ReturnType<DashboardDataSource["load"]>> | undefined) =>
          loaded
            ? {
                ...loaded,
                providerStatuses: refreshed.providerStatuses,
                published: refreshed.published
              }
            : loaded
      );
      showNotice("Provider 同步完成；Live Projection 已更新，草稿 Revision 未改变");
    }
  });

  const enqueueSyncMutation = useMutation({
    mutationFn: () => {
      const statuses = query.data?.providerStatuses ?? [];
      const provider = statuses.some(
        (status) =>
          status.provider === "netease" &&
          (status.connection === "connected" || status.connection === "requires_attention")
      )
        ? "netease"
        : "fixture";
      return source.enqueueProviderSync(provider);
    },
    onError: () => {
      showNotice("Provider 同步任务未能入队；当前 Projection 保持不变");
    },
    onSuccess: (job) => {
      completedSyncJob.current = null;
      setSyncJobId(job.jobId);
      void queryClient.invalidateQueries({ queryKey: ["sync-job", job.jobId, source.kind] });
      showNotice(
        job.attemptCount > 0 ? "复用正在执行的 Provider SyncRun" : "Provider SyncRun 已入队"
      );
    }
  });

  useEffect(() => {
    if (!query.data) return;
    if (source.kind === "api") {
      if (query.data.draft) {
        const current = useDashboardStore.getState();
        if (current.dirty) {
          current.acceptProjectionRefresh(query.data.published, query.data.draft.dashboard.widgets);
        } else {
          replaceFromRemote(
            query.data.published,
            query.data.draft.dashboard,
            query.data.draft.concurrencyToken
          );
        }
      } else {
        replacePublic(query.data.published);
      }
    } else {
      if (!query.data.draft) return;
      initializeLocal(
        query.data.published,
        query.data.draft.dashboard,
        query.data.draft.concurrencyToken
      );
    }
  }, [initializeLocal, query.data, replaceFromRemote, replacePublic, source.kind]);

  useEffect(() => {
    const job = syncJobQuery.data;
    if (!job) return;
    if (job.status === "completed" && completedSyncJob.current !== job.jobId) {
      completedSyncJob.current = job.jobId;
      refreshProjectionMutation.mutate();
    }
    if (job.status === "failed" && completedSyncJob.current !== job.jobId) {
      completedSyncJob.current = job.jobId;
      showNotice("Provider 同步失败；Last Known Good Projection 已保留");
    }
  }, [refreshProjectionMutation, syncJobQuery.data]);

  const syncState: SyncUiState =
    source.kind === "mock"
      ? mockSyncState
      : enqueueSyncMutation.isError
        ? "failed"
        : enqueueSyncMutation.isPending
          ? "queued"
          : syncJobQuery.isError
            ? "failed"
            : syncJobQuery.data
              ? toSyncUiState(syncJobQuery.data.status)
              : syncJobId
                ? "queued"
                : "idle";

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      syncTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

  useEffect(() => {
    if (source.kind === "api" && query.data?.session.role !== "owner" && store.mode !== "display") {
      store.setMode("display");
    }
  }, [query.data?.session.role, source.kind, store]);

  const hasCachedDashboard = store.initialized && store.draft && store.published;
  if (query.isPending && !hasCachedDashboard) {
    return <DashboardLoading />;
  }

  if ((query.isError || !query.data) && !hasCachedDashboard) {
    return (
      <main className="nivalis-page flex min-h-screen items-center justify-center p-6">
        <div className="glass-surface-strong max-w-md rounded-[24px] p-8 text-center">
          <h1 className="text-xl font-extrabold text-ink">Dashboard 暂时无法加载</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {source.kind === "api"
              ? "Nivalis API 不可用。确认 Persistence Migration、Seed 与 API 服务均已启动。"
              : "Mock Read Model 初始化失败。刷新页面后可重试。"}
          </p>
        </div>
      </main>
    );
  }

  if (!store.draft || !store.published) return <DashboardLoading />;
  const session = query.data?.session;
  const isOwner = source.kind === "mock" || session?.role === "owner";
  const effectiveMode = isOwner ? store.mode : "display";
  const snapshot = effectiveMode === "edit" ? store.draft : store.published;
  const providerStatuses = query.data?.providerStatuses ?? [];

  const addWidget = (type: WidgetType) => {
    const definition = widgetRegistry.preferred(type);
    if (!definition) return;
    const id = crypto.randomUUID();
    const widget = withInstanceDefaults(
      createMockWidget(type, id, definition.schemaVersion),
      snapshot.widgets
    );
    store.addWidget(widget, definition.sizes);
    showNotice(`${definition.name} 已加入本地草稿`);
  };

  const startMockSync = () => {
    if (source.kind === "api") {
      enqueueSyncMutation.mutate();
      return;
    }
    syncTimers.current.forEach((timer) => window.clearTimeout(timer));
    setMockSyncState("queued");
    setNotice("Mock 同步任务已进入队列");
    syncTimers.current = [
      window.setTimeout(() => setMockSyncState("running"), 450),
      window.setTimeout(() => {
        setMockSyncState("completed");
        setNotice("Mock 同步完成；未访问任何 Provider");
      }, 1_350)
    ];
  };

  return (
    <main className="nivalis-page">
      <div className="nivalis-content">
        {isOwner ? (
          <TopActionBar
            authenticated={session?.authenticated ?? source.kind === "mock"}
            isOwner
            mode={effectiveMode}
            onLogin={() => startAuthenticationMutation.mutate()}
            onLogout={() => logoutMutation.mutate()}
            onModeChange={store.setMode}
            onSync={startMockSync}
            providerStatuses={providerStatuses}
            syncState={syncState}
          />
        ) : null}

        {isOwner && query.isError && hasCachedDashboard ? (
          <div
            className="glass-surface mt-3 rounded-xl px-4 py-2 text-xs font-bold text-amber-800"
            role="alert"
          >
            API 暂时不可用，正在显示上次保留的本地状态；编辑内容不会被清除。
          </div>
        ) : null}

        {effectiveMode === "edit" && isOwner ? (
          <div className="relative z-30 mt-3 sm:absolute sm:top-[61px] sm:right-0 sm:mt-0">
            <EditToolbar
              dirty={store.dirty}
              onAdd={() => setAddDialogOpen(true)}
              onHistory={() => setHistoryOpen(true)}
              onPublish={() => publishMutation.mutate(store.draft!)}
              onReset={() => {
                store.resetDraft();
                showNotice("草稿已恢复为已发布布局");
              }}
              onSave={() => saveMutation.mutate(store.draft!)}
              publishing={publishMutation.isPending}
              saving={saveMutation.isPending}
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
                {snapshot.profile.displayName}
                <span className="mx-2 text-blue-400">/</span>
                {snapshot.profile.headline}
              </p>
            </div>
            {isOwner ? (
              <span className="glass-surface rounded-full px-3 py-1.5 text-[10px] font-bold text-blue-700">
                {source.kind === "api"
                  ? "Phase 5 · Netease Provider"
                  : "Phase 1 · Explicit Mock Data"}
              </span>
            ) : null}
          </div>
        </header>

        <div className="mt-2">
          <DashboardCanvas
            editable={isOwner && effectiveMode === "edit"}
            layout={snapshot.layout}
            onLayoutChange={store.updateBreakpointLayout}
            onDataConfigChange={store.updateWidgetDataConfig}
            onPresentationConfigChange={store.updateWidgetPresentationConfig}
            onRemoveWidget={(widgetId) => {
              store.removeWidget(widgetId);
              showNotice("模块已从本地草稿移除，可通过重置恢复");
            }}
            widgets={snapshot.widgets.filter((widget) => widget.enabled)}
          />
        </div>

        {isOwner && effectiveMode === "edit" ? (
          <ModuleCatalog
            onAdd={addWidget}
            onOpenCatalog={() => setAddDialogOpen(true)}
            widgets={snapshot.widgets}
          />
        ) : null}

        {isOwner ? (
          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 px-2 text-[10px] font-medium text-blue-900/55">
            <span>
              Published version {store.published.revision} ·{" "}
              {source.kind === "api" ? "Nivalis API" : "Local Fixture"}
            </span>
            <span>
              Provider 数据：{source.kind === "api" ? "异步 Projection 管线" : "显式 Mock"}
            </span>
          </footer>
        ) : null}
      </div>

      {isOwner ? (
        <AddWidgetDialog
          onAdd={addWidget}
          onOpenChange={setAddDialogOpen}
          open={addDialogOpen}
          widgets={snapshot.widgets}
        />
      ) : null}

      {isOwner && historyOpen ? (
        <RevisionHistoryDialog
          onOpenChange={setHistoryOpen}
          onRestore={(revisionId) => restoreMutation.mutate(revisionId)}
          open
          restoring={restoreMutation.isPending}
          source={source}
        />
      ) : null}

      {isOwner ? (
        <RevisionConflictDialog
          conflict={store.conflict}
          onKeepLocal={store.clearConflict}
          onOpenHistory={() => {
            store.clearConflict();
            setHistoryOpen(true);
          }}
          onReloadServer={() => reloadMutation.mutate()}
          reloading={reloadMutation.isPending}
        />
      ) : null}

      {isOwner ? (
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
      ) : null}
    </main>
  );
}

function withInstanceDefaults(
  widget: WidgetProjection,
  existing: readonly WidgetProjection[]
): WidgetProjection {
  if (widget.type !== "music.netease.social") return widget;
  const existingViews = existing
    .filter((candidate) => candidate.type === "music.netease.social")
    .map((candidate) => candidate.dataConfig.view);
  const view = !existingViews.includes("following")
    ? "following"
    : !existingViews.includes("followers")
      ? "followers"
      : "combined";
  const publicLists = view === "combined" ? [] : [view];
  return {
    ...widget,
    data: { ...widget.data, view },
    dataConfig: { publicLimit: view === "combined" ? 0 : 8, publicLists, view },
    title:
      view === "following"
        ? "网易云 · 关注"
        : view === "followers"
          ? "网易云 · 粉丝"
          : "网易云 · 乐友关系"
  } as WidgetProjection;
}

function toDraftUpdate(snapshot: LocalDashboardSnapshot): DashboardEditableDraft {
  return {
    layout: snapshot.layout,
    widgets: snapshot.widgets
  };
}

function toSyncUiState(status: "queued" | "running" | "retrying" | "completed" | "failed") {
  return status;
}
