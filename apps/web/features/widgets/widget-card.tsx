import { PuzzlePiece } from "@phosphor-icons/react";

import { ModuleShell } from "../../design-system/module-shell";
import { widgetRegistry } from "./widget-registry";
import type { RuntimeWidgetProjection } from "./widget-types";

interface WidgetCardProps {
  readonly editable: boolean;
  readonly onRemove: () => void;
  readonly widget: RuntimeWidgetProjection;
}

export function WidgetCard({ editable, onRemove, widget }: WidgetCardProps) {
  const definition = widgetRegistry.resolve(widget.type, widget.schemaVersion);

  if (!definition) {
    return (
      <ModuleShell
        accent="lilac"
        editable={editable}
        icon={<PuzzlePiece aria-hidden size={19} weight="duotone" />}
        onRemove={onRemove}
        stale={widget.stale}
        subtitle={`${widget.type}@${widget.schemaVersion}`}
        title="暂不支持的模块"
      >
        <div className="flex h-full items-center rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-xs leading-relaxed text-violet-800">
          当前前端没有匹配此 type + schemaVersion 的 Renderer。其它模块仍可正常显示。
        </div>
      </ModuleShell>
    );
  }

  const { Icon, Renderer } = definition;
  const subtitle = definition.subtitle?.(widget as never);
  return (
    <ModuleShell
      accent={definition.accent}
      editable={editable}
      icon={<Icon aria-hidden size={19} />}
      kind={definition.kind}
      onRemove={onRemove}
      stale={widget.stale}
      {...(subtitle ? { subtitle } : {})}
      title={widget.title}
    >
      <Renderer widget={widget as never} />
    </ModuleShell>
  );
}
