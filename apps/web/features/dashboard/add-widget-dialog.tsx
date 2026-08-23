"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { WidgetProjection, WidgetType } from "@nivalis/api-client";
import { Plus, X } from "@phosphor-icons/react";

import { widgetRegistry } from "../widgets/widget-registry";

interface AddWidgetDialogProps {
  readonly onAdd: (type: WidgetType) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly widgets: readonly WidgetProjection[];
}

export function AddWidgetDialog({ onAdd, onOpenChange, open, widgets }: AddWidgetDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm" />
        <Dialog.Content className="glass-surface-strong fixed top-1/2 left-1/2 z-50 max-h-[84vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[26px] p-6">
          <Dialog.Title className="text-xl font-extrabold tracking-[-0.02em] text-ink">
            添加模块
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-relaxed text-ink-muted">
            新实例会使用 Smart Default 自动寻找空位，随后可自由拖拽和缩放。
          </Dialog.Description>
          <Dialog.Close
            aria-label="关闭"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700"
          >
            <X aria-hidden size={16} weight="bold" />
          </Dialog.Close>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {widgetRegistry.list().map((definition) => {
              const alreadyPresent = widgets.some((widget) => widget.type === definition.type);
              const disabled = alreadyPresent && !definition.allowMultiple;
              const { Icon } = definition;
              return (
                <button
                  className="group flex min-h-24 items-center gap-4 rounded-2xl border border-white/85 bg-white/55 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                  disabled={disabled}
                  key={definition.type}
                  onClick={() => {
                    onAdd(definition.type);
                    onOpenChange(false);
                  }}
                  type="button"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                    <Icon aria-hidden size={23} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-ink">{definition.name}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-ink-muted">
                      {disabled ? "此模块仅允许一个实例" : definition.description}
                    </span>
                  </span>
                  <Plus aria-hidden className="shrink-0 text-blue-500" size={17} weight="bold" />
                </button>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
