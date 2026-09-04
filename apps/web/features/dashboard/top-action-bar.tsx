"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ProviderStatus } from "@nivalis/api-client";
import {
  ArrowClockwise,
  Code,
  Database,
  GearSix,
  Info,
  SignIn,
  SignOut,
  SpinnerGap,
  X
} from "@phosphor-icons/react";
import clsx from "clsx";
import Link from "next/link";

import type { DashboardMode } from "./dashboard-store";

export type SyncUiState = "completed" | "failed" | "idle" | "queued" | "retrying" | "running";

interface TopActionBarProps {
  readonly authenticated: boolean;
  readonly isOwner: boolean;
  readonly mode: DashboardMode;
  readonly onLogin: () => void;
  readonly onLogout: () => void;
  readonly onModeChange: (mode: DashboardMode) => void;
  readonly onSync: () => void;
  readonly providerStatuses: readonly ProviderStatus[];
  readonly syncState: SyncUiState;
}

const providerNames: Record<ProviderStatus["provider"], string> = {
  fixture: "Fixture Provider",
  netease: "网易云音乐",
  github: "GitHub",
  bilibili: "Bilibili",
  steam: "Steam",
  bangumi: "Bangumi"
};

function DialogCloseButton() {
  return (
    <Dialog.Close
      aria-label="关闭"
      className="nivalis-modal-close absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-blue-700"
    >
      <X aria-hidden size={16} weight="bold" />
    </Dialog.Close>
  );
}

function ModalFrame({
  children,
  title,
  description
}: Readonly<{ children: React.ReactNode; title: string; description: string }>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="nivalis-modal-overlay fixed inset-0 z-50" />
      <Dialog.Content className="nivalis-modal glass-surface-strong fixed top-1/2 left-1/2 z-50 max-h-[82vh] w-[min(92vw,560px)] overflow-y-auto rounded-[24px] p-6 text-ink outline-none">
        <Dialog.Title className="pr-10 text-xl font-extrabold tracking-[-0.02em]">
          {title}
        </Dialog.Title>
        <Dialog.Description className="mt-1 pr-10 text-xs leading-relaxed text-ink-muted">
          {description}
        </Dialog.Description>
        <DialogCloseButton />
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function TopActionBar({
  authenticated,
  isOwner,
  mode,
  onLogin,
  onLogout,
  onModeChange,
  onSync,
  providerStatuses,
  syncState
}: TopActionBarProps) {
  const syncing = syncState === "queued" || syncState === "running" || syncState === "retrying";

  return (
    <nav aria-label="About Me 页面操作" className="top-action-bar">
      <span className="view-status-chip" data-mode={mode}>
        {mode === "edit" ? "编辑视图" : "展示视图"}
      </span>

      <div className="mode-switch glass-surface-strong">
        <button
          aria-pressed={mode === "display"}
          className={clsx("mode-switch-button", mode !== "display" && "text-ink-muted")}
          data-mode="display"
          onClick={() => onModeChange("display")}
          type="button"
        >
          展示视图
        </button>
        <button
          aria-pressed={mode === "edit"}
          className={clsx("mode-switch-button", mode !== "edit" && "text-ink-muted")}
          data-mode="edit"
          onClick={() => onModeChange("edit")}
          type="button"
        >
          编辑视图
        </button>
      </div>

      <div className="top-action-tools glass-surface-strong">
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button aria-label="状态信息" className="top-action-button" type="button">
              <Info aria-hidden size={16} weight="duotone" />
              <span className="hidden md:inline">状态信息</span>
            </button>
          </Dialog.Trigger>
          <ModalFrame
            description="状态来自持久化 Provider 连接与同步记录。网易云凭据只在 Settings 写入并加密保存；Fixture 仅用于开发与测试。"
            title="Provider 状态"
          >
            <div className="mt-5 space-y-2">
              {providerStatuses.map((status) => (
                <div
                  className="dialog-option flex items-center justify-between rounded-2xl px-4 py-3"
                  key={status.provider}
                >
                  <span>
                    <span className="block text-sm font-bold">
                      {providerNames[status.provider]}
                    </span>
                    <span className="mt-0.5 block text-[9px] font-semibold text-ink-muted">
                      {providerStatusDetail(status)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                    <Database aria-hidden size={16} weight="duotone" />
                    {connectionStatusLabel(status)}
                  </span>
                </div>
              ))}
            </div>
          </ModalFrame>
        </Dialog.Root>

        <button
          aria-label={syncState === "completed" ? "已同步" : "同步"}
          className="top-action-button"
          disabled={syncing || !isOwner}
          onClick={onSync}
          title="同步经由 Nivalis API、独立 Worker、Raw Snapshot 与 Projection；浏览器不会访问 Provider"
          type="button"
        >
          {syncing ? (
            <SpinnerGap aria-hidden className="animate-spin" size={16} />
          ) : (
            <ArrowClockwise aria-hidden size={16} weight="bold" />
          )}
          <span className="hidden sm:inline">
            {syncState === "completed" ? "已同步" : syncState === "failed" ? "重试同步" : "同步"}
          </span>
        </button>

        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button aria-label="API 文档" className="top-action-button" type="button">
              <Code aria-hidden size={17} weight="bold" />
              <span className="hidden md:inline">API 文档</span>
            </button>
          </Dialog.Trigger>
          <ModalFrame
            description="OpenAPI 3.1 是唯一正式契约；Revision 配置、Live Projection 与 SyncRun 是独立资源。"
            title="Nivalis API · v1"
          >
            <div className="mt-5 space-y-2 font-mono text-[11px]">
              {[
                ["GET", "/v1/public/dashboards/about"],
                ["GET", "/v1/me/dashboards/about/draft"],
                ["GET", "/v1/me/dashboards/about/data"],
                ["PUT", "/v1/me/dashboards/about/draft"],
                ["POST", "/v1/me/dashboards/about/publish"],
                ["GET", "/v1/me/dashboards/about/revisions"],
                ["POST", "/v1/me/dashboards/about/revisions/{revisionId}/restore"],
                ["POST", "/v1/me/providers/{provider}/sync"],
                ["GET", "/v1/me/sync-jobs/{jobId}"]
              ].map(([method, path]) => (
                <div
                  className="dialog-option flex gap-3 rounded-xl px-3 py-2.5"
                  key={`${method}-${path}`}
                >
                  <span className="w-11 font-extrabold text-blue-600">{method}</span>
                  <span className="break-all text-ink">{path}</span>
                </div>
              ))}
            </div>
          </ModalFrame>
        </Dialog.Root>

        <button
          aria-label={authenticated ? "退出登录" : "使用 GitHub 登录"}
          className="top-action-button"
          onClick={authenticated ? onLogout : onLogin}
          type="button"
        >
          {authenticated ? (
            <SignOut aria-hidden size={17} weight="bold" />
          ) : (
            <SignIn aria-hidden size={17} weight="bold" />
          )}
          <span className="hidden lg:inline">{authenticated ? "退出" : "登录"}</span>
        </button>

        <Link aria-label="打开设置" className="top-action-button" href="/settings">
          <GearSix aria-hidden size={18} weight="duotone" />
        </Link>
      </div>
    </nav>
  );
}

function syncStatusLabel(status: ProviderStatus["syncStatus"]) {
  const labels: Record<ProviderStatus["syncStatus"], string> = {
    completed: "同步完成",
    credential_invalid: "凭据失效",
    failed: "同步失败",
    idle: "等待同步",
    queued: "排队中",
    retrying: "等待重试",
    running: "同步中"
  };
  return labels[status];
}

function connectionStatusLabel(status: ProviderStatus) {
  switch (status.connection) {
    case "fixture":
      return `${syncStatusLabel(status.syncStatus)} · Fixture`;
    case "connected":
      return syncStatusLabel(status.syncStatus);
    case "requires_attention":
      return "需要重新连接";
    case "disabled":
      return "已禁用";
    case "not_connected":
      return "未连接";
  }
}

function providerStatusDetail(status: ProviderStatus) {
  if (status.lastErrorCode) return `错误：${status.lastErrorCode}`;
  if (status.lastSuccessAt) {
    const suffix = status.attemptCount > 0 ? `${status.attemptCount} 次尝试` : "Seed Projection";
    return `最近成功 ${status.lastSuccessAt.replace("T", " ").slice(5, 16)} UTC · ${suffix}`;
  }
  return "尚无真实同步记录";
}
