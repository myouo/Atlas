import { PuzzlePiece } from "@phosphor-icons/react";
import type { NeteaseDataCatalog, WidgetProjection } from "@nivalis/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { dashboardSource } from "../../api/dashboard-source-factory";
import { ModuleShell } from "../../design-system/module-shell";
import { WidgetDisplaySettingsDialog } from "./widget-display-settings-dialog";
import type { WidgetDataResourceOption } from "./widget-display-settings-dialog";
import { widgetRegistry } from "./widget-registry";
import type { RuntimeWidgetProjection } from "./widget-types";

interface WidgetCardProps {
  readonly editable: boolean;
  readonly onDataConfigChange?: (config: WidgetProjection["dataConfig"]) => void;
  readonly onPresentationConfigChange?: (config: WidgetProjection["presentationConfig"]) => void;
  readonly onRemove: () => void;
  readonly widget: RuntimeWidgetProjection;
}

export function WidgetCard({
  editable,
  onDataConfigChange,
  onPresentationConfigChange,
  onRemove,
  widget
}: WidgetCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const definition = widgetRegistry.resolve(widget.type, widget.schemaVersion);
  const catalogQuery = useQuery({
    enabled: Boolean(settingsOpen && definition?.resourcePicker),
    queryFn: () => dashboardSource.getNeteaseDataCatalog(),
    queryKey: ["provider-data", "netease", dashboardSource.kind],
    retry: false
  });

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
  const dataPresets = definition.dataPresets ?? [];
  const configurable =
    controls.length > 0 || dataPresets.length > 0 || Boolean(definition.resourcePicker);
  return (
    <>
      <ModuleShell
        accent={definition.accent}
        editable={editable}
        icon={<Icon aria-hidden size={19} />}
        kind={definition.kind}
        {...(editable && configurable ? { onConfigure: () => setSettingsOpen(true) } : {})}
        onRemove={onRemove}
        stale={widget.stale}
        {...(subtitle ? { subtitle } : {})}
        title={widget.title}
      >
        <Renderer widget={widget as never} />
      </ModuleShell>
      {configurable && "presentationConfig" in widget ? (
        <WidgetDisplaySettingsDialog
          controls={controls}
          dataConfig={widget.dataConfig}
          dataPresets={dataPresets}
          name={definition.name}
          onDataConfigChange={(config) => onDataConfigChange?.(config)}
          onChange={(config) => onPresentationConfigChange?.(config)}
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          presentationConfig={widget.presentationConfig}
          resourceMaxItems={definition.resourcePicker === "netease-showcase-gallery" ? 6 : 1}
          resourceOptions={neteaseResourceOptions(catalogQuery.data)}
          resourceSelectionMode={
            definition.resourcePicker === "netease-showcase-gallery" ? "gallery" : "single"
          }
        />
      ) : null}
    </>
  );
}

function neteaseResourceOptions(
  catalog: NeteaseDataCatalog | undefined
): readonly WidgetDataResourceOption[] {
  if (!catalog) return [];
  const options: WidgetDataResourceOption[] = [];
  if (typeof catalog.catalog.listening.totalDurationSeconds === "number") {
    options.push({
      label: "听歌数据 · 累计播放时间",
      resourceId: "total",
      source: "listening_duration"
    });
  }
  for (const item of catalog.catalog.weeklyRanking) {
    options.push({
      label: `本周歌曲 · ${item.track.name}`,
      resourceId: item.track.providerTrackId,
      source: "weekly_track"
    });
  }
  for (const item of catalog.catalog.allTimeRanking) {
    options.push({
      label: `长期歌曲 · ${item.track.name}`,
      resourceId: item.track.providerTrackId,
      source: "all_time_track"
    });
  }
  const playlists = objectArray(catalog.catalog.createdPlaylists.items);
  for (const item of playlists) {
    const resourceId = stringValue(item.providerPlaylistId);
    const name = stringValue(item.name);
    if (resourceId && name) {
      options.push({ label: `创建歌单 · ${name}`, resourceId, source: "created_playlist" });
    }
  }
  const medals = objectArray(catalog.catalog.medals.items);
  for (const item of medals) {
    const resourceId = stringValue(item.providerMedalCode);
    const name = stringValue(item.name);
    if (resourceId && name)
      options.push({ label: `乐迷徽章 · ${name}`, resourceId, source: "medal" });
  }
  const musicCards = objectArray(catalog.catalog.musicCards.items);
  for (const [index, item] of musicCards.entries()) {
    const resourceId = stringValue(item.providerCardId);
    const title =
      nonEmptyString(item.title) ?? nonEmptyString(item.description) ?? `主页卡片 ${index + 1}`;
    if (resourceId && title) {
      options.push({
        label: `Provider 音乐卡片 · ${title}`,
        resourceId,
        source: "provider_music_card"
      });
    }
  }
  return options;
}

function objectArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
