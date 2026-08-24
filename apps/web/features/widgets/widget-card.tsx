import { PuzzlePiece } from "@phosphor-icons/react";
import type { WidgetProjection } from "@nivalis/api-client";
import { useState } from "react";

import { ModuleShell } from "../../design-system/module-shell";
import { WidgetDisplaySettingsDialog } from "./widget-display-settings-dialog";
import { widgetRegistry } from "./widget-registry";
import type { RuntimeWidgetProjection } from "./widget-types";

interface WidgetCardProps {
  readonly editable: boolean;
  readonly onPresentationConfigChange?: (config: WidgetProjection["presentationConfig"]) => void;
  readonly onRemove: () => void;
  readonly widget: RuntimeWidgetProjection;
}

export function WidgetCard({
  editable,
  onPresentationConfigChange,
  onRemove,
  widget
}: WidgetCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const controls = definition.presentationControls ?? [];
  return (
    <>
      <ModuleShell
        accent={definition.accent}
        editable={editable}
        icon={<Icon aria-hidden size={19} />}
        kind={definition.kind}
        {...(editable && controls.length > 0 ? { onConfigure: () => setSettingsOpen(true) } : {})}
        onRemove={onRemove}
        stale={widget.stale}
        {...(subtitle ? { subtitle } : {})}
        title={widget.title}
      >
        <Renderer widget={widget as never} />
      </ModuleShell>
      {controls.length > 0 && "presentationConfig" in widget ? (
        <WidgetDisplaySettingsDialog
          controls={controls}
          name={definition.name}
          onChange={(config) => onPresentationConfigChange?.(config)}
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          presentationConfig={widget.presentationConfig}
        />
      ) : null}
    </>
  );
}
