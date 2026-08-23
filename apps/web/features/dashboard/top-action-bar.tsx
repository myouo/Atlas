"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowClockwise,
  CheckCircle,
  Code,
  GearSix,
  Info,
  SpinnerGap,
  X
} from "@phosphor-icons/react";
import clsx from "clsx";
import Link from "next/link";

import type { DashboardMode } from "./dashboard-store";

export type SyncUiState = "completed" | "idle" | "queued" | "running";

interface TopActionBarProps {
  readonly mode: DashboardMode;
  readonly onModeChange: (mode: DashboardMode) => void;
  readonly onSync: () => void;
  readonly syncState: SyncUiState;
}

const providerStates = [
  ["网易云音乐", "Mock 就绪"],
  ["GitHub", "Mock 就绪"],
  ["Bilibili", "Mock 就绪"],
  ["Steam", "Mock 就绪"],
  ["Bangumi", "Mock 就绪"]
] as const;

function DialogCloseButton() {
  return (
    <Dialog.Close
      aria-label="关闭"
      className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition hover:bg-blue-100"
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
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm" />
      <Dialog.Content className="glass-surface-strong fixed top-1/2 left-1/2 z-50 max-h-[82vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[24px] p-6 text-ink">
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

export function TopActionBar({ mode, onModeChange, onSync, syncState }: TopActionBarProps) {
  const syncing = syncState === "queued" || syncState === "running";

  return (
    <nav
      aria-label="About Me 页面操作"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <span
        className={clsx(
          "rounded-full px-4 py-2 text-sm font-extrabold text-white shadow-[0_8px_22px_rgba(36,112,226,0.24)]",
          mode === "edit" ? "bg-fuchsia-500" : "bg-blue-500"
        )}
      >
        {mode === "edit" ? "编辑视图" : "展示视图"}
      </span>

      <div className="glass-surface-strong order-3 flex rounded-[14px] p-1 sm:order-none sm:ml-auto">
        <button
          aria-pressed={mode === "display"}
          className={clsx(
            "min-w-24 rounded-[10px] px-4 py-2 text-xs font-bold transition",
            mode === "display"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-ink-muted hover:text-blue-700"
          )}
          onClick={() => onModeChange("display")}
          type="button"
        >
          展示视图
        </button>
        <button
          aria-pressed={mode === "edit"}
          className={clsx(
            "min-w-24 rounded-[10px] px-4 py-2 text-xs font-bold transition",
            mode === "edit"
              ? "bg-white text-fuchsia-600 shadow-sm"
              : "text-ink-muted hover:text-fuchsia-600"
          )}
          onClick={() => onModeChange("edit")}
          type="button"
        >
          编辑视图
        </button>
      </div>

      <div className="glass-surface-strong flex items-center overflow-hidden rounded-[14px]">
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              aria-label="状态信息"
              className="flex h-11 items-center gap-2 border-r border-blue-100/80 px-3 text-xs font-bold text-ink transition hover:bg-white/60"
              type="button"
            >
              <Info aria-hidden size={16} weight="duotone" />
              <span className="hidden md:inline">状态信息</span>
            </button>
          </Dialog.Trigger>
          <ModalFrame
            description="Phase 1 仅展示明确标记的 Provider Mock 状态，不包含真实连接或凭据。"
            title="Provider 状态"
          >
            <div className="mt-5 space-y-2">
              {providerStates.map(([provider, status]) => (
                <div
                  className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/55 px-4 py-3"
                  key={provider}
                >
                  <span className="text-sm font-bold">{provider}</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    <CheckCircle aria-hidden size={16} weight="fill" />
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </ModalFrame>
        </Dialog.Root>

        <button
          aria-label={syncState === "completed" ? "已同步" : "同步"}
          className="flex h-11 items-center gap-2 border-r border-blue-100/80 px-3 text-xs font-bold text-ink transition hover:bg-white/60 disabled:cursor-wait disabled:opacity-60"
          disabled={syncing}
          onClick={onSync}
          title="Phase 1 模拟异步同步状态，不访问 Provider"
          type="button"
        >
          {syncing ? (
            <SpinnerGap aria-hidden className="animate-spin" size={16} />
          ) : (
            <ArrowClockwise aria-hidden size={16} weight="bold" />
          )}
          <span className="hidden sm:inline">{syncState === "completed" ? "已同步" : "同步"}</span>
        </button>

        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              aria-label="API 文档"
              className="flex h-11 items-center gap-2 border-r border-blue-100/80 px-3 text-xs font-bold text-ink transition hover:bg-white/60"
              type="button"
            >
              <Code aria-hidden size={17} weight="bold" />
              <span className="hidden md:inline">API 文档</span>
            </button>
          </Dialog.Trigger>
          <ModalFrame
            description="OpenAPI 3.1 是前后端之间唯一正式契约；以下路径在 Phase 1 已定义，服务实现从 Phase 2 开始。"
            title="Nivalis API · v1"
          >
            <div className="mt-5 space-y-2 font-mono text-[11px]">
              {[
                ["GET", "/v1/public/dashboards/about"],
                ["GET", "/v1/me/dashboards/about/draft"],
                ["PUT", "/v1/me/dashboards/about/draft"],
                ["POST", "/v1/me/dashboards/about/publish"],
                ["POST", "/v1/me/providers/{provider}/sync"],
                ["GET", "/v1/me/sync-jobs/{jobId}"]
              ].map(([method, path]) => (
                <div
                  className="flex gap-3 rounded-xl border border-white/80 bg-white/55 px-3 py-2.5"
                  key={`${method}-${path}`}
                >
                  <span className="w-11 font-extrabold text-blue-600">{method}</span>
                  <span className="break-all text-ink">{path}</span>
                </div>
              ))}
            </div>
          </ModalFrame>
        </Dialog.Root>

        <Link
          aria-label="打开设置"
          className="flex h-11 w-11 items-center justify-center text-ink transition hover:bg-white/60"
          href="/settings"
        >
          <GearSix aria-hidden size={18} weight="duotone" />
        </Link>
      </div>
    </nav>
  );
}
