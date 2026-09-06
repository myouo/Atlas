"use client";

import { Component } from "react";
import type { ReactNode } from "react";
import type { RuntimeWidgetProjection } from "./widget-types";

/** Catch a single card, including its expanded view and settings portal. */
export class WidgetRenderBoundary extends Component<
  {
    readonly children: ReactNode;
    readonly fallback: ReactNode;
    readonly resetKey: string;
  },
  { failed: boolean; resetKey: string | null }
> {
  override state = { failed: false, resetKey: null as string | null };
  static getDerivedStateFromProps(
    props: { readonly resetKey: string },
    state: { readonly resetKey: string | null }
  ) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function widgetHasDisplayData(widget: RuntimeWidgetProjection): boolean {
  const data = widget.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length === 0)
    return false;
  // Legacy fixtures may be configured without a matching saved projection.
  const numericFields: Record<string, readonly string[]> = {
    "steam.profile@1": ["games", "playtimeHours", "achievements", "screenshots"],
    "github.profile@1": ["repositories", "stars", "followers", "contributions"],
    "bilibili.profile@1": ["following", "followers", "views", "likes"],
    "bangumi.collection@1": ["entries", "watched", "watching", "reviews"],
    "system.stats@1": ["value"]
  };
  return (numericFields[`${widget.type}@${widget.schemaVersion}`] ?? []).every((field) => {
    const value = (data as Record<string, unknown>)[field];
    return typeof value === "number" && Number.isFinite(value);
  });
}

export function WidgetDataPlaceholder({
  failed = false,
  legacySteam = false,
  editable = false
}: {
  readonly failed?: boolean;
  readonly legacySteam?: boolean;
  readonly editable?: boolean;
}) {
  return (
    <div
      className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-white/35 p-4 text-center"
      role="status"
    >
      <p className="text-sm font-bold text-ink">
        {failed ? "此模块暂时无法显示" : "尚无可展示的数据"}
      </p>
      <p className="text-xs leading-relaxed text-ink-muted">
        {legacySteam && editable
          ? "这是旧版 Steam 示例卡片。请在设置中连接 Steam，并添加新的 Steam 模块。"
          : failed
            ? "请稍后刷新此模块。"
            : editable
              ? "请连接对应账号并完成数据同步。"
              : "等待数据更新。"}
      </p>
    </div>
  );
}
