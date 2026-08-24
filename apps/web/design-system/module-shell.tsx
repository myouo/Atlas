"use client";

import { DotsSixVertical, SlidersHorizontal, WarningCircle, X } from "@phosphor-icons/react";
import clsx from "clsx";
import type { ReactNode } from "react";

export type WidgetAccent = "blue" | "coral" | "ink" | "lilac" | "rose";
export type ModuleShellKind = "hero" | "standard" | "stat";

interface ModuleShellProps {
  readonly accent: WidgetAccent;
  readonly children: ReactNode;
  readonly editable: boolean;
  readonly icon?: ReactNode;
  readonly kind?: ModuleShellKind;
  readonly onConfigure?: () => void;
  readonly onRemove?: () => void;
  readonly stale?: boolean;
  readonly subtitle?: string;
  readonly title: string;
}

const accentClasses: Record<WidgetAccent, { badge: string; icon: string }> = {
  blue: { badge: "bg-blue-50 text-blue-700", icon: "bg-blue-600 text-white" },
  coral: { badge: "bg-rose-50 text-rose-600", icon: "bg-[#ff4668] text-white" },
  ink: { badge: "bg-slate-100 text-slate-700", icon: "bg-[#0b2b68] text-white" },
  lilac: { badge: "bg-violet-50 text-violet-700", icon: "bg-[#8a60dc] text-white" },
  rose: { badge: "bg-pink-50 text-pink-700", icon: "bg-[#ff4f91] text-white" }
};

export function ModuleShell({
  accent,
  children,
  editable,
  icon,
  kind = "standard",
  onConfigure,
  onRemove,
  stale = false,
  subtitle,
  title
}: ModuleShellProps) {
  const showHeader = kind === "standard";
  const styles = accentClasses[accent];

  return (
    <section
      aria-label={title}
      className={clsx(
        "glass-surface group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[16px]",
        "transition-[box-shadow,border-color,transform] duration-200",
        editable && "border-dashed !border-blue-400/80 shadow-[0_13px_40px_rgba(45,94,205,0.18)]"
      )}
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

      {showHeader ? (
        <header className={clsx("flex items-center gap-3 px-5 pt-4 pb-3", editable && "pt-8")}>
          {icon ? (
            <span
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm",
                styles.icon
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink">
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
            {subtitle ? (
              <p className="mt-0.5 truncate text-[11px] font-medium text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
        </header>
      ) : null}

      <div className={clsx("min-h-0 flex-1", showHeader ? "px-5 pb-5" : "h-full")}>{children}</div>
    </section>
  );
}
