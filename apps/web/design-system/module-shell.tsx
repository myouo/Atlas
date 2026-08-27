"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowsOutSimple,
  DotsSixVertical,
  SlidersHorizontal,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import clsx from "clsx";
import { createContext, type ReactNode, useContext, useState } from "react";

export type WidgetAccent = "blue" | "coral" | "ink" | "lilac" | "rose";
export type ModuleShellKind = "hero" | "standard" | "stat";

interface ModuleShellProps {
  readonly accent: WidgetAccent;
  readonly children: ReactNode;
  readonly editable: boolean;
  readonly expandable?: boolean;
  readonly icon?: ReactNode;
  readonly kind?: ModuleShellKind;
  readonly onConfigure?: () => void;
  readonly onRemove?: () => void;
  readonly stale?: boolean;
  readonly title: string;
}

interface ModuleShellFrameProps extends ModuleShellProps {
  readonly expandControl?: ReactNode;
  readonly expanded?: boolean;
}

const ModuleShellExpansionContext = createContext(false);

export function useModuleShellExpansion() {
  return useContext(ModuleShellExpansionContext);
}

const accentClasses: Record<WidgetAccent, { badge: string; icon: string }> = {
  blue: { badge: "bg-blue-50 text-blue-700", icon: "bg-blue-600 text-white" },
  coral: { badge: "bg-rose-50 text-rose-600", icon: "bg-[#ff4668] text-white" },
  ink: { badge: "bg-slate-100 text-slate-700", icon: "bg-[#0b2b68] text-white" },
  lilac: { badge: "bg-violet-50 text-violet-700", icon: "bg-[#8a60dc] text-white" },
  rose: { badge: "bg-pink-50 text-pink-700", icon: "bg-[#ff4f91] text-white" }
};

export function ModuleShell(props: ModuleShellProps) {
  return props.expandable ? <ExpandableModuleShell {...props} /> : <ModuleShellFrame {...props} />;
}

function ExpandableModuleShell(props: ModuleShellProps) {
  const [expanded, setExpanded] = useState(false);
  const styles = accentClasses[props.accent];
  const expandPosition = props.editable
    ? props.onRemove && props.onConfigure
      ? "right-[72px]"
      : props.onRemove || props.onConfigure
        ? "right-10"
        : "right-2"
    : "right-3";

  return (
    <Dialog.Root onOpenChange={setExpanded} open={expanded}>
      <ModuleShellFrame
        {...props}
        expandControl={
          <Dialog.Trigger asChild>
            <button
              aria-label={`放大 ${props.title}`}
              className={clsx(
                "absolute top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/88 text-blue-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white",
                expandPosition
              )}
              type="button"
            >
              <ArrowsOutSimple aria-hidden size={14} weight="bold" />
            </button>
          </Dialog.Trigger>
        }
        expanded={expanded}
      />

      <Dialog.Portal>
        <Dialog.Overlay className="module-expand-overlay fixed inset-0 z-[90] bg-[#071a3d]/38 backdrop-blur-sm" />
        <Dialog.Content className="module-shell-expanded glass-surface-strong fixed z-[100] flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/90 p-4 shadow-[0_28px_90px_rgba(4,28,77,0.3)] outline-none sm:p-6">
          <Dialog.Title className="flex min-w-0 items-center gap-3 pr-12 text-lg font-black tracking-[-0.025em] text-ink">
            {props.icon ? (
              <span
                className={clsx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm",
                  styles.icon
                )}
              >
                {props.icon}
              </span>
            ) : null}
            <span className="truncate">{props.title}</span>
            {props.stale ? (
              <span className={clsx("rounded-full px-2 py-1 text-[10px] font-bold", styles.badge)}>
                待更新
              </span>
            ) : null}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {props.title} 的完整内容。按 Escape 或关闭按钮返回 Dashboard。
          </Dialog.Description>
          <Dialog.Close
            aria-label={`关闭 ${props.title} 全屏视图`}
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/85 bg-white/85 text-ink shadow-sm transition hover:bg-white sm:top-6 sm:right-6"
          >
            <X aria-hidden size={17} weight="bold" />
          </Dialog.Close>
          <div className="module-shell-expanded-content mt-4 min-h-0 flex-1 overflow-y-auto rounded-[18px] border border-white/65 bg-white/34 p-3 sm:mt-5 sm:p-5">
            <ModuleShellExpansionContext.Provider value>
              {props.children}
            </ModuleShellExpansionContext.Provider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModuleShellFrame({
  accent,
  children,
  editable,
  expandControl,
  expanded = false,
  icon,
  kind = "standard",
  onConfigure,
  onRemove,
  stale = false,
  title
}: ModuleShellFrameProps) {
  const showHeader = kind === "standard";
  const styles = accentClasses[accent];

  return (
    <section
      aria-label={title}
      className={clsx(
        "module-shell glass-surface group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] select-none",
        "transition-[box-shadow,border-color,transform] duration-200",
        editable && "border-dashed !border-blue-400/80 shadow-[0_13px_40px_rgba(45,94,205,0.18)]"
      )}
      data-kind={kind}
      data-testid="module-shell"
    >
      {editable ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-8 items-start justify-center">
          <button
            aria-label={`拖动 ${title}`}
            className="module-drag-handle pointer-events-auto mt-1 flex h-7 w-10 cursor-grab items-center justify-center rounded-full border border-blue-200 bg-white/90 text-blue-600 shadow-sm active:cursor-grabbing"
            type="button"
          >
            <DotsSixVertical aria-hidden size={18} weight="bold" />
          </button>
        </div>
      ) : null}

      {editable && onRemove ? (
        <button
          aria-label={`移除 ${title}`}
          className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/92 text-slate-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden size={14} weight="bold" />
        </button>
      ) : null}

      {editable && onConfigure ? (
        <button
          aria-label={`设置 ${title} 展示字段`}
          className={clsx(
            "absolute top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/92 text-blue-600 shadow-sm transition hover:bg-blue-50",
            onRemove ? "right-10" : "right-2"
          )}
          onClick={onConfigure}
          type="button"
        >
          <SlidersHorizontal aria-hidden size={14} weight="bold" />
        </button>
      ) : null}

      {showHeader ? expandControl : null}

      {showHeader ? (
        <header
          className={clsx(
            "module-shell-header flex shrink-0 items-center gap-3 px-5 pt-4 pb-2.5",
            editable && "pt-8",
            expandControl && !editable && "pr-12"
          )}
        >
          {icon ? (
            <span
              className={clsx(
                "module-shell-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm",
                styles.icon
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="module-shell-title truncate text-[14px] font-bold tracking-[-0.01em] text-ink">
                {title}
              </h2>
              {stale ? (
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    styles.badge
                  )}
                >
                  <WarningCircle aria-hidden size={11} />
                  待更新
                </span>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <div
        className={clsx("module-shell-content min-h-0 flex-1", showHeader ? "px-5 pb-5" : "h-full")}
      >
        {expanded ? null : (
          <ModuleShellExpansionContext.Provider value={false}>
            {children}
          </ModuleShellExpansionContext.Provider>
        )}
      </div>
    </section>
  );
}
