"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { DashboardRevisionMetadata } from "@nivalis/api-client";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  Eye,
  SpinnerGap,
  X
} from "@phosphor-icons/react";
import { useState } from "react";

import type { DashboardDataSource } from "../../api/dashboard-source";

interface RevisionHistoryDialogProps {
  readonly onOpenChange: (open: boolean) => void;
  readonly onRestore: (revisionId: string) => void;
  readonly open: boolean;
  readonly restoring: boolean;
  readonly source: DashboardDataSource;
}

const operationNames: Record<DashboardRevisionMetadata["operation"], string> = {
  initial_migration: "Phase 2 数据迁移",
  seed: "初始 Fixture",
  save: "保存草稿",
  widget_add: "添加模块",
  widget_update: "更新模块",
  widget_delete: "删除模块",
  restore: "恢复历史版本",
  schema_upgrade: "Widget Schema 升级"
};

export function RevisionHistoryDialog({
  onOpenChange,
  onRestore,
  open,
  restoring,
  source
}: RevisionHistoryDialogProps) {
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<DashboardRevisionMetadata | null>(null);
  const history = useQuery({
    enabled: open,
    queryFn: () => source.listRevisions({ limit: 50 }),
    queryKey: ["dashboard", "about", "revisions", source.kind]
  });
  const detail = useQuery({
    enabled: open && Boolean(selectedRevisionId),
    queryFn: () => source.getRevision(selectedRevisionId!),
    queryKey: ["dashboard", "about", "revision", source.kind, selectedRevisionId]
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedRevisionId(null);
      setRestoreCandidate(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/25 backdrop-blur-sm" />
        <Dialog.Content className="glass-surface-strong fixed top-1/2 left-1/2 z-[61] max-h-[86vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[26px] p-6 text-ink shadow-2xl">
          <div className="flex items-start gap-3 pr-10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <ClockCounterClockwise aria-hidden size={24} weight="duotone" />
            </span>
            <div>
              <Dialog.Title className="text-xl font-extrabold tracking-[-0.02em]">
                历史版本
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-ink-muted">
                每个版本都是不可变完整快照。恢复只会创建新的草稿，不会改变当前公开页面。
              </Dialog.Description>
            </div>
          </div>

          {history.isPending ? (
            <div className="flex min-h-48 items-center justify-center text-sm font-bold text-blue-700">
              <SpinnerGap aria-hidden className="mr-2 animate-spin" size={18} />
              正在读取 Revision History
            </div>
          ) : history.isError ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm font-bold text-rose-700">
              历史版本暂时无法加载。
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]">
              <div className="space-y-2">
                {history.data?.items.map((revision) => (
                  <article
                    className="rounded-2xl border border-white/80 bg-white/55 p-4 shadow-sm"
                    key={revision.revisionId}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-extrabold">
                            Revision {revision.revisionNumber}
                          </h3>
                          {revision.isCurrentDraft ? <Marker>当前草稿</Marker> : null}
                          {revision.isCurrentPublished ? <Marker>当前发布</Marker> : null}
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-ink-muted">
                          {operationNames[revision.operation]} · {formatDate(revision.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex h-8 items-center gap-1 rounded-lg border border-blue-100 bg-white/70 px-2.5 text-[11px] font-bold text-blue-700 hover:bg-white"
                          onClick={() => setSelectedRevisionId(revision.revisionId)}
                          type="button"
                        >
                          <Eye aria-hidden size={14} />
                          预览
                        </button>
                        <button
                          className="flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={revision.isCurrentDraft || restoring}
                          onClick={() => setRestoreCandidate(revision)}
                          type="button"
                        >
                          <ArrowCounterClockwise aria-hidden size={14} />
                          恢复
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {history.data?.nextCursor ? (
                  <p className="px-2 pt-2 text-[11px] font-semibold text-ink-muted">
                    仅显示最近 50 个版本；更多历史可通过 Cursor API 继续读取。
                  </p>
                ) : null}
              </div>

              <aside className="rounded-2xl border border-white/80 bg-blue-50/45 p-4">
                <h3 className="text-xs font-extrabold text-blue-800">只读预览</h3>
                {!selectedRevisionId ? (
                  <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                    选择一个 Revision 查看来源、布局与 Widget 数量。预览不会改变当前草稿。
                  </p>
                ) : detail.isPending ? (
                  <SpinnerGap className="mt-4 animate-spin text-blue-600" size={20} />
                ) : detail.data ? (
                  <div className="mt-3 space-y-3 text-xs">
                    <div>
                      <p className="font-extrabold">Revision {detail.data.revisionNumber}</p>
                      <p className="mt-1 text-ink-muted">{operationNames[detail.data.operation]}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-2">
                      <PreviewMetric label="Widgets" value={String(detail.data.widgets.length)} />
                      <PreviewMetric
                        label="LG modules"
                        value={String(detail.data.layout.lg.length)}
                      />
                    </dl>
                    {detail.data.restoredFromRevisionId ? (
                      <p className="rounded-xl bg-white/65 p-2.5 text-ink-muted">
                        此版本由另一个历史 Revision 恢复创建。
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-bold text-rose-700">预览加载失败。</p>
                )}
              </aside>
            </div>
          )}

          {restoreCandidate ? (
            <div className="mt-5 rounded-2xl border border-fuchsia-200/70 bg-fuchsia-50/75 p-4">
              <p className="text-sm font-extrabold">
                确认恢复 Revision {restoreCandidate.revisionNumber}？
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                恢复会创建一个新的草稿版本，不会修改此历史版本，也不会自动发布。
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="h-9 rounded-xl border border-blue-100 bg-white/70 px-4 text-xs font-bold"
                  disabled={restoring}
                  onClick={() => setRestoreCandidate(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="h-9 rounded-xl bg-fuchsia-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                  disabled={restoring}
                  onClick={() => onRestore(restoreCandidate.revisionId)}
                  type="button"
                >
                  {restoring ? "正在创建新草稿" : "恢复为新草稿"}
                </button>
              </div>
            </div>
          ) : null}

          <Dialog.Close
            aria-label="关闭历史版本"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition hover:bg-blue-100"
          >
            <X aria-hidden size={16} weight="bold" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Marker({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-extrabold text-blue-700">
      {children}
    </span>
  );
}

function PreviewMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl bg-white/65 p-2.5">
      <dt className="text-[9px] font-bold tracking-wide text-ink-muted uppercase">{label}</dt>
      <dd className="mt-1 text-base font-black text-blue-800">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
