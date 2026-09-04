import {
  ArrowCounterClockwise,
  Check,
  ClockCounterClockwise,
  CloudArrowUp,
  Plus
} from "@phosphor-icons/react";

interface EditToolbarProps {
  readonly dirty: boolean;
  readonly onAdd: () => void;
  readonly onHistory: () => void;
  readonly onPublish: () => void;
  readonly onReset: () => void;
  readonly onSave: () => void;
  readonly publishing: boolean;
  readonly saving: boolean;
}

export function EditToolbar({
  dirty,
  onAdd,
  onHistory,
  onPublish,
  onReset,
  onSave,
  publishing,
  saving
}: EditToolbarProps) {
  const busy = publishing || saving;
  return (
    <div className="edit-toolbar glass-surface-strong">
      <div className="edit-toolbar-status">
        <span
          className={
            dirty ? "h-2 w-2 rounded-full bg-amber-500" : "h-2 w-2 rounded-full bg-emerald-500"
          }
        />
        {dirty ? "草稿有未保存调整" : "草稿已保存"}
      </div>
      <div className="edit-toolbar-actions">
        <button
          aria-label="添加模块"
          className="edit-toolbar-button"
          disabled={busy}
          onClick={onAdd}
          type="button"
        >
          <Plus aria-hidden size={15} weight="bold" />
          <span className="hidden lg:inline">添加模块</span>
        </button>
        <button
          aria-label="历史版本"
          className="edit-toolbar-button"
          disabled={busy}
          onClick={onHistory}
          type="button"
        >
          <ClockCounterClockwise aria-hidden size={15} weight="bold" />
          <span className="hidden lg:inline">历史版本</span>
        </button>
        <button
          aria-label="重置布局"
          className="edit-toolbar-button"
          disabled={!dirty || busy}
          onClick={onReset}
          type="button"
        >
          <ArrowCounterClockwise aria-hidden size={15} weight="bold" />
          <span className="hidden lg:inline">重置布局</span>
        </button>
        <button
          aria-label={saving ? "正在保存草稿" : "保存草稿"}
          className="edit-toolbar-button"
          data-variant="save"
          disabled={busy}
          onClick={onSave}
          type="button"
        >
          <Check aria-hidden size={15} weight="bold" />
          {saving ? "保存中" : "保存"}
        </button>
        <button
          aria-label={publishing ? "正在发布布局" : "发布布局"}
          className="edit-toolbar-button"
          data-variant="publish"
          disabled={busy}
          onClick={onPublish}
          type="button"
        >
          <CloudArrowUp aria-hidden size={16} weight="bold" />
          {publishing ? "发布中" : "发布"}
        </button>
      </div>
    </div>
  );
}
