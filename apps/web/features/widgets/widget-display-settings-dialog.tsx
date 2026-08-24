"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { WidgetProjection } from "@nivalis/api-client";
import { ArrowCounterClockwise, ShieldCheck, X } from "@phosphor-icons/react";
import { useState } from "react";

import type { WidgetDataPreset } from "./widget-registry";
import type { WidgetPresentationControl } from "./widget-presentation";
import {
  presentationSelection,
  presentationToggle,
  withPresentationValue
} from "./widget-presentation";

interface WidgetDisplaySettingsDialogProps {
  readonly controls: readonly WidgetPresentationControl[];
  readonly dataConfig: WidgetProjection["dataConfig"];
  readonly dataPresets: readonly WidgetDataPreset[];
  readonly name: string;
  readonly onDataConfigChange: (config: WidgetProjection["dataConfig"]) => void;
  readonly onChange: (config: WidgetProjection["presentationConfig"]) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly presentationConfig: WidgetProjection["presentationConfig"];
  readonly resourceOptions?: readonly WidgetDataResourceOption[];
}

export interface WidgetDataResourceOption {
  readonly label: string;
  readonly resourceId: string;
  readonly source:
    "weekly_track" | "all_time_track" | "created_playlist" | "medal" | "provider_music_card";
}

export function WidgetDisplaySettingsDialog({
  controls,
  dataConfig,
  dataPresets,
  name,
  onDataConfigChange,
  onChange,
  onOpenChange,
  open,
  presentationConfig,
  resourceOptions = []
}: WidgetDisplaySettingsDialogProps) {
  const [resourceQuery, setResourceQuery] = useState("");
  const visibleResources = filterResourceOptions(resourceOptions, resourceQuery);
  const resourceGroups = groupResourceOptions(visibleResources);
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm" />
        <Dialog.Content className="glass-surface-strong fixed top-1/2 left-1/2 z-50 max-h-[84vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[26px] p-6">
          <Dialog.Title className="text-xl font-extrabold tracking-[-0.02em] text-ink">
            {name} · 卡片编排
          </Dialog.Title>
          <Dialog.Description className="mt-1 pr-8 text-xs leading-relaxed text-ink-muted">
            公开策略由服务端 Projection 执行，未选数据不会进入公共 Read
            Model。外观选项只影响渲染；保存草稿后同步并发布才会更新公开页面。
          </Dialog.Description>
          <Dialog.Close
            aria-label="关闭展示字段设置"
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700"
          >
            <X aria-hidden size={16} weight="bold" />
          </Dialog.Close>

          {dataPresets.length > 0 ? (
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden className="text-emerald-600" size={18} weight="duotone" />
                <div>
                  <h3 className="text-sm font-extrabold text-ink">公开数据策略</h3>
                  <p className="text-[10px] text-ink-muted">
                    选择一个有明确语义的公开范围，而不是逐个暴露原始字段。
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {dataPresets.map((preset) => {
                  const selected = stableJson(dataConfig) === stableJson(preset.dataConfig);
                  return (
                    <button
                      aria-pressed={selected}
                      className={
                        selected
                          ? "rounded-2xl border-2 border-emerald-500 bg-emerald-50/80 p-4 text-left shadow-sm"
                          : "rounded-2xl border border-white/85 bg-white/55 p-4 text-left transition hover:bg-white/80"
                      }
                      key={preset.id}
                      onClick={() => onDataConfigChange(structuredClone(preset.dataConfig))}
                      type="button"
                    >
                      <span className="block text-sm font-extrabold text-ink">{preset.label}</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 rounded-xl bg-emerald-50/65 px-3 py-2 text-[9px] leading-relaxed font-semibold text-emerald-800">
                修改公开策略会改变 Projection Key；下次同步生成新分区，不会污染 Last Known Good。
              </p>
            </section>
          ) : null}

          {resourceOptions.length > 0 ? (
            <div className="mt-4 block rounded-2xl border border-blue-100 bg-blue-50/55 p-4">
              <span className="block text-sm font-extrabold text-ink">精确选择展示资源</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">
                选项来自 Owner-only 完整数据目录（共 {resourceOptions.length} 项）；公共 Projection
                只保存所选资源的安全摘要。
              </span>
              <input
                aria-label="搜索展示资源"
                className="mt-3 h-10 w-full rounded-xl border border-white bg-white/90 px-3 text-xs font-semibold text-ink outline-none ring-blue-400 focus:ring-2"
                onChange={(event) => setResourceQuery(event.target.value)}
                placeholder="搜索歌曲、歌单或徽章"
                type="search"
                value={resourceQuery}
              />
              <select
                aria-label="选择展示资源"
                className="mt-3 h-10 w-full rounded-xl border border-white bg-white/90 px-3 text-xs font-bold text-ink"
                onChange={(event) => {
                  const selected = resourceOptions.find(
                    (option) => `${option.source}:${option.resourceId}` === event.target.value
                  );
                  if (!selected) return;
                  onDataConfigChange({
                    ...dataConfig,
                    resourceId: selected.resourceId,
                    source: selected.source
                  });
                }}
                value={
                  typeof dataConfig.source === "string" && typeof dataConfig.resourceId === "string"
                    ? `${dataConfig.source}:${dataConfig.resourceId}`
                    : ""
                }
              >
                <option value="">使用所选策略的第一项</option>
                {resourceGroups.map((group) => (
                  <optgroup key={group.source} label={group.label}>
                    {group.options.map((option) => (
                      <option
                        key={`${option.source}:${option.resourceId}`}
                        value={`${option.source}:${option.resourceId}`}
                      >
                        {option.label.replace(/^.*? · /, "")}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {resourceQuery && visibleResources.length === 0 ? (
                <span className="mt-2 block text-[9px] font-semibold text-amber-700">
                  当前数据目录中没有匹配资源
                </span>
              ) : null}
            </div>
          ) : null}

          {controls.length > 0 ? (
            <section
              className={dataPresets.length > 0 ? "mt-6 border-t border-blue-100/70 pt-5" : "mt-6"}
            >
              <h3 className="mb-3 text-sm font-extrabold text-ink">卡片表现</h3>
              <div className="space-y-3">
                {controls.map((control) =>
                  control.kind === "toggle" ? (
                    <label
                      className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/85 bg-white/55 p-4"
                      key={control.key}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold text-ink">
                          {control.label}
                        </span>
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
                            withPresentationValue(
                              presentationConfig,
                              control.key,
                              event.target.checked
                            )
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
                            withPresentationValue(
                              presentationConfig,
                              control.key,
                              event.target.value
                            )
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
            </section>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function filterResourceOptions(options: readonly WidgetDataResourceOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (normalized) {
    return options
      .filter((option) => option.label.toLocaleLowerCase("zh-CN").includes(normalized))
      .slice(0, 100);
  }
  const counts = new Map<WidgetDataResourceOption["source"], number>();
  return options.filter((option) => {
    const count = counts.get(option.source) ?? 0;
    if (count >= 12) return false;
    counts.set(option.source, count + 1);
    return true;
  });
}

function groupResourceOptions(options: readonly WidgetDataResourceOption[]) {
  const labels: Record<WidgetDataResourceOption["source"], string> = {
    all_time_track: "全部时间排行",
    created_playlist: "创建歌单",
    medal: "乐迷徽章",
    provider_music_card: "Provider 原生音乐卡片",
    weekly_track: "最近一周排行"
  };
  return Object.entries(labels).flatMap(([source, label]) => {
    const matched = options.filter((option) => option.source === source);
    return matched.length > 0
      ? [
          {
            label,
            options: matched,
            source: source as WidgetDataResourceOption["source"]
          }
        ]
      : [];
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function withoutControlValues(
  config: WidgetProjection["presentationConfig"],
  controls: readonly WidgetPresentationControl[]
) {
  const next = { ...config };
  controls.forEach((control) => delete next[control.key]);
  return next;
}
