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
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useState
} from "react";

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
const ModuleShellTransientStateContext = createContext<Map<string, unknown> | null>(null);

export function useModuleShellExpansion() {
  return useContext(ModuleShellExpansionContext);
}

export function useModuleShellTransientState<T>(
  key: string,
  initialValue: T | (() => T)
): readonly [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(ModuleShellTransientStateContext);
  const [value, setValue] = useState<T>(() => {
    if (store?.has(key)) return store.get(key) as T;
    return typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
  });
  const setPersistentValue = useCallback<Dispatch<SetStateAction<T>>>(
    (nextValue) => {
      setValue((currentValue) => {
        const resolved =
          typeof nextValue === "function"
            ? (nextValue as (current: T) => T)(currentValue)
            : nextValue;
        store?.set(key, resolved);
        return resolved;
      });
    },
    [key, store]
  );
  return [value, setPersistentValue] as const;
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
  const [transientState] = useState(() => new Map<string, unknown>());
  const styles = accentClasses[props.accent];

  return (
    <ModuleShellTransientStateContext.Provider value={transientState}>
      <Dialog.Root onOpenChange={setExpanded} open={expanded}>
        <ModuleShellFrame
          {...props}
          expandControl={
            <Dialog.Trigger asChild>
              <button
                aria-label={`放大 ${props.title}`}
                className="module-shell-action module-expand-control text-blue-600"
                type="button"
              >
                <ArrowsOutSimple aria-hidden size={14} weight="bold" />
              </button>
            </Dialog.Trigger>
          }
          expanded={expanded}
        />

        <Dialog.Portal>
          <Dialog.Overlay className="module-expand-overlay nivalis-modal-overlay fixed inset-0 z-[90]" />
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
                <span
                  className={clsx("rounded-full px-2 py-1 text-[10px] font-bold", styles.badge)}
                >
                  待更新
                </span>
              ) : null}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {props.title} 的完整内容。按 Escape 或关闭按钮返回 Dashboard。
            </Dialog.Description>
            <Dialog.Close
              aria-label={`关闭 ${props.title} 全屏视图`}
              className="nivalis-modal-close jelly-control absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full text-ink sm:top-6 sm:right-6"
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
    </ModuleShellTransientStateContext.Provider>
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
        "module-shell glass-surface group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] select-none"
      )}
      data-accent={accent}
      data-editable={editable}
      data-kind={kind}
      data-testid="module-shell"
    >
      {editable ? (
        <div className="module-edit-rail">
          <button
            aria-label={`拖动 ${title}`}
            className="module-shell-action module-drag-handle"
            type="button"
          >
            <DotsSixVertical aria-hidden size={18} weight="bold" />
          </button>
          <div className="module-edit-actions">
            {showHeader ? expandControl : null}
            {onConfigure ? (
              <button
                aria-label={`设置 ${title} 展示字段`}
                className="module-shell-action text-blue-600"
                onClick={onConfigure}
                type="button"
              >
                <SlidersHorizontal aria-hidden size={14} weight="bold" />
              </button>
            ) : null}
            {onRemove ? (
              <button
                aria-label={`移除 ${title}`}
                className="module-shell-action"
                data-action="remove"
                onClick={onRemove}
                type="button"
              >
                <X aria-hidden size={14} weight="bold" />
              </button>
            ) : null}
          </div>
        </div>
      ) : showHeader && expandControl ? (
        <div className="module-display-actions">{expandControl}</div>
      ) : null}

      {showHeader ? (
        <header
          className={clsx(
            "module-shell-header flex shrink-0 items-center gap-3 px-5 pt-4 pb-2.5",
            editable && "pt-11",
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
