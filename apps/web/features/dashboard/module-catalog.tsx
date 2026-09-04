import type { WidgetProjection, WidgetType } from "@nivalis/api-client";
import { Plus, SquaresFour } from "@phosphor-icons/react";

import { widgetRegistry } from "../widgets/widget-registry";

interface ModuleCatalogProps {
  readonly onAdd: (type: WidgetType) => void;
  readonly onOpenCatalog: () => void;
  readonly widgets: readonly WidgetProjection[];
}

export function ModuleCatalog({ onAdd, onOpenCatalog, widgets }: ModuleCatalogProps) {
  const providerDefinitions = widgetRegistry
    .list()
    .filter(
      (definition) => definition.type !== "profile.hero" && definition.type !== "system.stats"
    );

  return (
    <section className="module-catalog glass-surface mt-5 rounded-[22px] p-4" aria-label="我的模块">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <SquaresFour aria-hidden className="text-blue-600" size={18} weight="duotone" />
          我的模块
        </h2>
        <p className="text-[11px] font-medium text-ink-muted">
          拖拽卡片可调整位置与大小 · 同类型可创建多个实例
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        {providerDefinitions.map((definition) => {
          const disabled =
            !definition.allowMultiple && widgets.some((widget) => widget.type === definition.type);
          const { Icon } = definition;
          return (
            <button
              className="module-catalog-option jelly-control flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white/55 px-2 text-[10px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
              disabled={disabled}
              key={definition.type}
              onClick={() => onAdd(definition.type)}
              type="button"
            >
              <Icon aria-hidden className="text-blue-600" size={16} />
              <span className="truncate">{definition.name}</span>
            </button>
          );
        })}
        <button
          className="module-catalog-option jelly-control flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-2 text-[10px] font-extrabold text-blue-600"
          onClick={onOpenCatalog}
          type="button"
        >
          <Plus aria-hidden size={16} weight="bold" />
          添加模块
        </button>
      </div>
    </section>
  );
}
