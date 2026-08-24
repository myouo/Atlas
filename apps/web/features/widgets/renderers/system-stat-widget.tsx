import { CalendarDots, CheckCircle, Database, Stack } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import type { WidgetOf } from "../widget-types";
import { presentationToggle } from "../widget-presentation";

const metricPresentation: Record<
  WidgetOf<"system.stats">["data"]["metric"],
  { readonly Icon: Icon; readonly label: string; readonly suffix: string }
> = {
  uptime_days: { Icon: CalendarDots, label: "累计运行天数", suffix: "天" },
  providers_connected: { Icon: Stack, label: "接入平台数", suffix: "个" },
  sync_completeness: { Icon: CheckCircle, label: "数据同步", suffix: "%" },
  records_collected: { Icon: Database, label: "收集数据量", suffix: "条" }
};

export function SystemStatWidget({ widget }: Readonly<{ widget: WidgetOf<"system.stats"> }>) {
  const presentation = metricPresentation[widget.data.metric];
  const value = widget.data.value.toLocaleString("zh-CN");
  const showLabel = presentationToggle(widget.presentationConfig, "showLabel");
  const showValue = presentationToggle(widget.presentationConfig, "showValue");
  const showUnit = presentationToggle(widget.presentationConfig, "showUnit");
  const showIcon = presentationToggle(widget.presentationConfig, "showIcon");

  return (
    <div className="flex h-full items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        {showLabel ? (
          <p className="truncate text-[11px] font-semibold tracking-wide text-ink-muted">
            {presentation.label}
          </p>
        ) : null}
        {showValue ? (
          <p className="mt-2 flex items-baseline gap-1 text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-[28px]">
            {value}
            {showUnit ? (
              <span className="text-xs font-bold text-ink-muted">{presentation.suffix}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      {showIcon ? (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white/60 text-blue-500 shadow-sm">
          <presentation.Icon aria-hidden size={28} weight="duotone" />
        </span>
      ) : null}
    </div>
  );
}
