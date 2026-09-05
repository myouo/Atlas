"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { WidgetProjection, WidgetType } from "@nivalis/api-client";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";

import { useDialogFocusReturn } from "../../design-system/use-dialog-focus-return";
import { widgetRegistry } from "../widgets/widget-registry";

interface AddWidgetDialogProps {
  readonly onAdd: (type: WidgetType) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly widgets: readonly WidgetProjection[];
}

export function AddWidgetDialog({ onAdd, onOpenChange, open, widgets }: AddWidgetDialogProps) {
  const [search, setSearch] = useState("");
  const focusReturn = useDialogFocusReturn();
  const query = search.trim().toLocaleLowerCase();
  const definitions = widgetRegistry
    .list()
    .filter((definition) =>
      `${definition.name} ${definition.description}`.toLocaleLowerCase().includes(query)
    );
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="nivalis-modal-overlay fixed inset-0 z-50" />
        <Dialog.Content
          {...focusReturn}
          className="catalog-dialog nivalis-modal glass-surface-strong fixed top-1/2 left-1/2 z-50 flex max-h-[84vh] w-[min(94vw,720px)] flex-col overflow-hidden rounded-[26px] outline-none"
        >
          <div className="catalog-dialog-header shrink-0 p-5 sm:p-6">
            <Dialog.Title className="pr-10 text-xl font-extrabold tracking-[-0.02em] text-ink">
              添加模块
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-relaxed text-ink-muted">
              选择想展示的内容。添加后可拖动、调整大小和设置展示字段。
            </Dialog.Description>
            <Dialog.Close
              aria-label="关闭"
              className="nivalis-modal-close absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-blue-700"
            >
              <X aria-hidden size={16} weight="bold" />
            </Dialog.Close>
            <label className="catalog-search mt-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-white/75 px-3">
              <MagnifyingGlass aria-hidden size={18} className="shrink-0 text-ink-muted" />
              <input
                aria-label="搜索模块"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索音乐、统计、GitHub…"
                type="search"
                value={search}
              />
            </label>
          </div>

          <div className="catalog-dialog-list min-h-0 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {definitions.map((definition) => {
                const alreadyPresent = widgets.some((widget) => widget.type === definition.type);
                const disabled = alreadyPresent && !definition.allowMultiple;
                const { Icon } = definition;
                return (
                  <button
                    className="dialog-option group flex min-h-20 items-center gap-3.5 rounded-2xl p-3.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={disabled}
                    key={definition.type}
                    onClick={() => {
                      onAdd(definition.type);
                      onOpenChange(false);
                    }}
                    type="button"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                      <Icon aria-hidden size={23} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-ink">
                        {definition.name}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-ink-muted">
                        {disabled ? "此模块仅允许一个实例" : definition.description}
                      </span>
                    </span>
                    <Plus aria-hidden className="shrink-0 text-blue-500" size={17} weight="bold" />
                  </button>
                );
              })}
            </div>
            {definitions.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted" role="status">
                没有找到匹配的模块，试试其他关键词。
              </p>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
