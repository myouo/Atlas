"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowClockwise, ClockCounterClockwise, ShieldWarning, X } from "@phosphor-icons/react";

import type { RevisionConflictState } from "../../api/dashboard-source";

interface RevisionConflictDialogProps {
  readonly conflict: RevisionConflictState | null;
  readonly onKeepLocal: () => void;
  readonly onOpenHistory: () => void;
  readonly onReloadServer: () => void;
  readonly reloading: boolean;
}

export function RevisionConflictDialog({
  conflict,
  onKeepLocal,
  onOpenHistory,
  onReloadServer,
  reloading
}: RevisionConflictDialogProps) {
  return (
    <Dialog.Root open={Boolean(conflict)} onOpenChange={(open) => !open && onKeepLocal()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/30 backdrop-blur-sm" />
        <Dialog.Content className="glass-surface-strong fixed top-1/2 left-1/2 z-[81] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-[24px] p-6 text-ink shadow-2xl">
          <div className="flex items-start gap-3 pr-10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ShieldWarning aria-hidden size={24} weight="duotone" />
            </span>
            <div>
              <Dialog.Title className="text-xl font-extrabold tracking-[-0.02em]">
                检测到新的版本
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-ink-muted">
                此 Dashboard 已在其他标签页或设备中更新。你的本地修改仍保留，Nivalis
                不会自动覆盖或合并它们。
              </Dialog.Description>
            </div>
          </div>

          {conflict ? (
            <div className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
              服务器当前版本：Revision {conflict.currentRevisionNumber}
            </div>
          ) : null}

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <button
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white/65 px-3 text-xs font-bold text-ink transition hover:bg-white"
              onClick={onOpenHistory}
              type="button"
            >
              <ClockCounterClockwise aria-hidden size={16} weight="bold" />
              查看最新版本
            </button>
            <button
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 text-xs font-bold whitespace-nowrap text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              disabled={reloading}
              onClick={onReloadServer}
              type="button"
            >
              <ArrowClockwise aria-hidden size={16} weight="bold" />
              {reloading ? "加载中" : "加载服务器版本"}
            </button>
            <button
              className="min-h-11 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-[0_6px_16px_rgba(37,118,237,0.24)] transition hover:bg-blue-700"
              onClick={onKeepLocal}
              type="button"
            >
              保留本地修改
            </button>
          </div>

          <Dialog.Close
            aria-label="关闭并保留本地修改"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition hover:bg-blue-100"
          >
            <X aria-hidden size={16} weight="bold" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
