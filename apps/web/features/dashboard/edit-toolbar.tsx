import { ArrowCounterClockwise, Check, CloudArrowUp, Plus } from "@phosphor-icons/react";

interface EditToolbarProps {
  readonly dirty: boolean;
  readonly onAdd: () => void;
  readonly onPublish: () => void;
  readonly onReset: () => void;
  readonly onSave: () => void;
}

export function EditToolbar({ dirty, onAdd, onPublish, onReset, onSave }: EditToolbarProps) {
  return (
    <div className="glass-surface-strong flex flex-wrap items-center justify-between gap-2 rounded-2xl p-1.5">
      <div className="hidden items-center gap-2 px-2 text-xs font-semibold text-ink-muted xl:flex">
        <span
          className={
            dirty ? "h-2 w-2 rounded-full bg-amber-500" : "h-2 w-2 rounded-full bg-emerald-500"
          }
        />
        {dirty ? "草稿有未保存调整" : "草稿已保存"}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          aria-label="添加模块"
          className="flex h-9 items-center gap-2 rounded-xl border border-blue-100 bg-white/65 px-2 text-xs font-bold text-ink transition hover:bg-white lg:px-3"
          onClick={onAdd}
          type="button"
        >
          <Plus aria-hidden size={15} weight="bold" />
          <span className="hidden lg:inline">添加模块</span>
        </button>
        <button
          aria-label="重置布局"
          className="flex h-9 items-center gap-2 rounded-xl border border-blue-100 bg-white/65 px-2 text-xs font-bold text-ink transition hover:bg-white disabled:opacity-45 lg:px-3"
          disabled={!dirty}
          onClick={onReset}
          type="button"
        >
          <ArrowCounterClockwise aria-hidden size={15} weight="bold" />
          <span className="hidden lg:inline">重置布局</span>
        </button>
        <button
          className="flex h-9 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
          onClick={onSave}
          type="button"
        >
          <Check aria-hidden size={15} weight="bold" />
          保存草稿
        </button>
        <button
          className="flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-[0_6px_16px_rgba(37,118,237,0.28)] transition hover:bg-blue-700"
          onClick={onPublish}
          type="button"
        >
          <CloudArrowUp aria-hidden size={16} weight="bold" />
          发布布局
        </button>
      </div>
    </div>
  );
}
