"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { WidgetProjection } from "@nivalis/api-client";
import { ArrowCounterClockwise, X } from "@phosphor-icons/react";

import type { WidgetPresentationControl } from "./widget-presentation";
import {
  presentationSelection,
  presentationToggle,
  withPresentationValue
} from "./widget-presentation";

interface WidgetDisplaySettingsDialogProps {
  readonly controls: readonly WidgetPresentationControl[];
  readonly name: string;
  readonly onChange: (config: WidgetProjection["presentationConfig"]) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly presentationConfig: WidgetProjection["presentationConfig"];
}

export function WidgetDisplaySettingsDialog({
  controls,
  name,
  onChange,
  onOpenChange,
  open,
  presentationConfig
}: WidgetDisplaySettingsDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm" />
        <Dialog.Content className="glass-surface-strong fixed top-1/2 left-1/2 z-50 max-h-[84vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[26px] p-6">
          <Dialog.Title className="text-xl font-extrabold tracking-[-0.02em] text-ink">
            {name} · 展示字段
          </Dialog.Title>
          <Dialog.Description className="mt-1 pr-8 text-xs leading-relaxed text-ink-muted">
            这里只调整卡片展示方式，不会重新同步 Provider，也不会改变 Projection
            Key。保存草稿后再发布，公开页面才会更新。
          </Dialog.Description>
          <Dialog.Close
            aria-label="关闭展示字段设置"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700"
          >
            <X aria-hidden size={16} weight="bold" />
          </Dialog.Close>

          <div className="mt-6 space-y-3">
            {controls.map((control) =>
              control.kind === "toggle" ? (
                <label
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/85 bg-white/55 p-4"
                  key={control.key}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-ink">{control.label}</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">
                      {control.description}
                    </span>
                  </span>
                  <input
                    checked={presentationToggle(
                      presentationConfig,
                      control.key,
                      control.defaultValue
                    )}
                    className="h-4 w-4 shrink-0 accent-blue-600"
                    onChange={(event) =>
                      onChange(
                        withPresentationValue(presentationConfig, control.key, event.target.checked)
                      )
                    }
                    type="checkbox"
                  />
                </label>
              ) : (
                <label
                  className="block rounded-2xl border border-white/85 bg-white/55 p-4"
                  key={control.key}
                >
                  <span className="block text-sm font-extrabold text-ink">{control.label}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">
                    {control.description}
                  </span>
                  <select
                    className="mt-3 h-10 w-full rounded-xl border border-blue-100 bg-white/85 px-3 text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-blue-400"
                    onChange={(event) =>
                      onChange(
                        withPresentationValue(presentationConfig, control.key, event.target.value)
                      )
                    }
                    value={presentationSelection(
                      presentationConfig,
                      control.key,
                      control.defaultValue,
                      control.options.map((option) => option.value)
                    )}
                  >
                    {control.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            )}
          </div>

          <button
            className="mt-5 flex h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white/70 px-4 text-xs font-bold text-blue-700 transition hover:bg-white"
            onClick={() => onChange(withoutControlValues(presentationConfig, controls))}
            type="button"
          >
            <ArrowCounterClockwise aria-hidden size={15} weight="bold" />
            恢复推荐展示
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function withoutControlValues(
  config: WidgetProjection["presentationConfig"],
  controls: readonly WidgetPresentationControl[]
) {
  const next = { ...config };
  controls.forEach((control) => delete next[control.key]);
  return next;
}
