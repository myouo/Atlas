"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { WidgetProjection } from "@nivalis/api-client";
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  Plus,
  ShieldCheck,
  Trash,
  X
} from "@phosphor-icons/react";
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
  readonly resourceMaxItems?: number;
  readonly resourceOptions?: readonly WidgetDataResourceOption[];
  readonly resourceSelectionMode?: "gallery" | "single";
}

export interface WidgetDataResourceOption {
  readonly label: string;
  readonly resourceId: string;
  readonly source:
    | "weekly_track"
    | "all_time_track"
    | "created_playlist"
    | "medal"
    | "listening_duration"
    | "provider_music_card";
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
  resourceMaxItems = 1,
  resourceOptions = [],
  resourceSelectionMode = "single"
}: WidgetDisplaySettingsDialogProps) {
  const [resourceQuery, setResourceQuery] = useState("");
  const visibleResources = filterResourceOptions(resourceOptions, resourceQuery);
  const resourceGroups = groupResourceOptions(visibleResources);
  const customGallery =
    resourceSelectionMode === "gallery" &&
    (dataConfig.mode === "custom" ||
      (dataConfig.mode !== "provider" && gallerySelections(dataConfig.selections).length > 0));
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

          {resourceSelectionMode === "gallery" || resourceOptions.length > 0 ? (
            <div className="mt-4 block rounded-2xl border border-blue-100 bg-blue-50/55 p-4">
              <span className="block text-sm font-extrabold text-ink">
                {resourceSelectionMode === "gallery" ? "展柜数据来源" : "精确选择展示资源"}
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">
                {resourceSelectionMode === "gallery"
                  ? `可跟随网易云主页，或从 Owner-only 完整目录的 ${resourceOptions.length} 项数据中自定义；公共 Projection 只保存安全摘要。`
                  : `选项来自 Owner-only 完整数据目录（共 ${resourceOptions.length} 项）；公共 Projection 只保存所选资源的安全摘要。`}
              </span>
              {resourceSelectionMode === "single" || customGallery ? (
                <input
                  aria-label="搜索展示资源"
                  className="mt-3 h-10 w-full rounded-xl border border-white bg-white/90 px-3 text-xs font-semibold text-ink outline-none ring-blue-400 focus:ring-2"
                  onChange={(event) => setResourceQuery(event.target.value)}
                  placeholder="搜索歌曲、歌单或徽章"
                  type="search"
                  value={resourceQuery}
                />
              ) : null}
              {resourceSelectionMode === "gallery" ? (
                <GalleryResourceEditor
                  dataConfig={dataConfig}
                  groups={resourceGroups}
                  maxItems={resourceMaxItems}
                  onChange={onDataConfigChange}
                  options={resourceOptions}
                />
              ) : (
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
                    typeof dataConfig.source === "string" &&
                    typeof dataConfig.resourceId === "string"
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
                          {resourceName(option)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {(resourceSelectionMode === "single" || customGallery) &&
              resourceQuery &&
              visibleResources.length === 0 ? (
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

function GalleryResourceEditor({
  dataConfig,
  groups,
  maxItems,
  onChange,
  options
}: {
  readonly dataConfig: WidgetProjection["dataConfig"];
  readonly groups: ReturnType<typeof groupResourceOptions>;
  readonly maxItems: number;
  readonly onChange: (config: WidgetProjection["dataConfig"]) => void;
  readonly options: readonly WidgetDataResourceOption[];
}) {
  const selected = gallerySelections(dataConfig.selections).slice(0, maxItems);
  const providerMode =
    dataConfig.mode === "provider" || (dataConfig.mode !== "custom" && selected.length === 0);
  const providerCards = options.filter((option) => option.source === "provider_music_card");
  const selectedKeys = new Set(selected.map(selectionKey));
  const update = (next: readonly ResourceSelection[]) =>
    onChange({ ...dataConfig, mode: "custom", selections: next.slice(0, maxItems) });

  return (
    <div className="mt-3 space-y-3">
      <section className="grid grid-cols-2 gap-2 rounded-2xl border border-white bg-white/65 p-2">
        <button
          aria-pressed={providerMode}
          className={
            providerMode
              ? "rounded-xl bg-[#ff4668] px-3 py-2.5 text-[10px] font-extrabold text-white shadow-sm"
              : "rounded-xl px-3 py-2.5 text-[10px] font-bold text-ink-muted transition hover:bg-white"
          }
          onClick={() => onChange({ ...dataConfig, mode: "provider" })}
          type="button"
        >
          跟随网易云主页
        </button>
        <button
          aria-pressed={!providerMode}
          className={
            !providerMode
              ? "rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-extrabold text-white shadow-sm"
              : "rounded-xl px-3 py-2.5 text-[10px] font-bold text-ink-muted transition hover:bg-white"
          }
          onClick={() => onChange({ ...dataConfig, mode: "custom" })}
          type="button"
        >
          Nivalis 自定义
        </button>
      </section>

      {providerMode ? (
        <section className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/90 to-white/70 p-4">
          <p className="text-xs font-extrabold text-ink">官方主页音乐卡片</p>
          <p className="mt-1 text-[9px] leading-relaxed font-semibold text-ink-muted">
            保留网易云服务端返回的卡片类型、标题和顺序，最多展示 6 项；Nivalis 不会用听歌排行补位。
          </p>
          {providerCards.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {providerCards.slice(0, maxItems).map((option, index) => (
                <span
                  className="rounded-full border border-rose-100 bg-white/85 px-2.5 py-1 text-[9px] font-bold text-ink"
                  key={resourceOptionKey(option)}
                >
                  {index + 1}. {resourceName(option)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-rose-200 px-3 py-3 text-center text-[9px] font-semibold text-ink-muted">
              当前目录尚无官方卡片；保存后同步即可重新读取网易云主页展柜。
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-white bg-white/65 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-extrabold text-ink">已入展</p>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-700">
                {selected.length} / {maxItems}
              </span>
            </div>
            {selected.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-blue-200 px-3 py-4 text-center text-[9px] font-semibold text-ink-muted">
                展柜为空。请从下方选择 1～{maxItems} 项音乐内容。
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {selected.map((selection, index) => {
                  const option = options.find(
                    (candidate) => resourceOptionKey(candidate) === selectionKey(selection)
                  );
                  return (
                    <div
                      className="flex items-center gap-2 rounded-xl border border-blue-50 bg-white/85 px-2.5 py-2"
                      key={selectionKey(selection)}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[9px] font-black text-blue-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-ink">
                        {option?.label ?? selection.resourceId}
                      </span>
                      <button
                        aria-label={`上移 ${option?.label ?? selection.resourceId}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-25"
                        disabled={index === 0}
                        onClick={() => update(moveSelection(selected, index, index - 1))}
                        type="button"
                      >
                        <ArrowUp aria-hidden size={13} weight="bold" />
                      </button>
                      <button
                        aria-label={`下移 ${option?.label ?? selection.resourceId}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-25"
                        disabled={index === selected.length - 1}
                        onClick={() => update(moveSelection(selected, index, index + 1))}
                        type="button"
                      >
                        <ArrowDown aria-hidden size={13} weight="bold" />
                      </button>
                      <button
                        aria-label={`移出展柜 ${option?.label ?? selection.resourceId}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                        onClick={() =>
                          update(selected.filter((_, candidate) => candidate !== index))
                        }
                        type="button"
                      >
                        <Trash aria-hidden size={13} weight="bold" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-white bg-white/45 p-3">
            {groups.map((group) => (
              <div key={group.source}>
                <p className="mb-1.5 text-[9px] font-extrabold tracking-[0.08em] text-ink-muted uppercase">
                  {group.label}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.options.map((option) => {
                    const key = resourceOptionKey(option);
                    const isSelected = selectedKeys.has(key);
                    return (
                      <button
                        className={
                          isSelected
                            ? "flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-left text-[9px] font-bold text-emerald-800"
                            : "flex min-h-10 items-center gap-2 rounded-xl border border-white bg-white/75 px-3 text-left text-[9px] font-bold text-ink transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-40"
                        }
                        disabled={isSelected || selected.length >= maxItems}
                        key={key}
                        onClick={() =>
                          update([
                            ...selected,
                            { resourceId: option.resourceId, source: option.source }
                          ])
                        }
                        type="button"
                      >
                        <Plus aria-hidden className="shrink-0" size={12} weight="bold" />
                        <span className="line-clamp-2">{resourceName(option)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

interface ResourceSelection {
  readonly resourceId: string;
  readonly source: WidgetDataResourceOption["source"];
}

function gallerySelections(value: unknown): readonly ResourceSelection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    if (typeof record.resourceId !== "string" || !isResourceSource(record.source)) return [];
    return [{ resourceId: record.resourceId, source: record.source }];
  });
}

function isResourceSource(value: unknown): value is WidgetDataResourceOption["source"] {
  return [
    "weekly_track",
    "all_time_track",
    "created_playlist",
    "medal",
    "listening_duration",
    "provider_music_card"
  ].includes(typeof value === "string" ? value : "");
}

function selectionKey(selection: ResourceSelection) {
  return `${selection.source}:${selection.resourceId}`;
}

function resourceOptionKey(option: WidgetDataResourceOption) {
  return `${option.source}:${option.resourceId}`;
}

function resourceName(option: WidgetDataResourceOption) {
  return option.label.replace(/^.*? · /, "");
}

function moveSelection(
  selections: readonly ResourceSelection[],
  from: number,
  to: number
): readonly ResourceSelection[] {
  if (to < 0 || to >= selections.length) return selections;
  const next = [...selections];
  const [selection] = next.splice(from, 1);
  if (selection) next.splice(to, 0, selection);
  return next;
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
    listening_duration: "听歌数据",
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
