import type { ReactNode } from "react";

import type { WidgetOf } from "../widget-types";

interface MetricItem {
  readonly label: string;
  readonly value: ReactNode;
}

function PlatformMetrics({ items }: Readonly<{ items: readonly MetricItem[] }>) {
  return (
    <div className="grid h-full grid-cols-2 content-center gap-x-5 gap-y-4 border-t border-blue-100/60 pt-3 sm:grid-cols-4 sm:gap-y-2">
      {items.map((item) => (
        <div className="min-w-0" key={item.label}>
          <p className="truncate text-[9px] font-semibold text-ink-muted">{item.label}</p>
          <p className="mt-1 truncate text-[13px] font-extrabold tracking-[-0.02em] text-ink sm:text-[14px]">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function GithubProfileWidget({ widget }: Readonly<{ widget: WidgetOf<"github.profile"> }>) {
  return (
    <PlatformMetrics
      items={[
        { label: "仓库", value: widget.data.repositories },
        { label: "Star", value: widget.data.stars.toLocaleString("zh-CN") },
        { label: "关注", value: widget.data.followers.toLocaleString("zh-CN") },
        { label: "贡献", value: widget.data.contributions.toLocaleString("zh-CN") }
      ]}
    />
  );
}

export function BilibiliProfileWidget({
  widget
}: Readonly<{ widget: WidgetOf<"bilibili.profile"> }>) {
  return (
    <PlatformMetrics
      items={[
        { label: "关注", value: widget.data.following },
        { label: "粉丝", value: widget.data.followers.toLocaleString("zh-CN") },
        { label: "播放", value: `${(widget.data.views / 1000).toFixed(1)}K` },
        { label: "获赞", value: widget.data.likes.toLocaleString("zh-CN") }
      ]}
    />
  );
}

export function SteamProfileWidget({ widget }: Readonly<{ widget: WidgetOf<"steam.profile"> }>) {
  return (
    <PlatformMetrics
      items={[
        { label: "游戏", value: widget.data.games },
        { label: "游戏时长", value: `${widget.data.playtimeHours.toLocaleString("zh-CN")} h` },
        { label: "成就", value: widget.data.achievements.toLocaleString("zh-CN") },
        { label: "截图", value: widget.data.screenshots.toLocaleString("zh-CN") }
      ]}
    />
  );
}

export function BangumiCollectionWidget({
  widget
}: Readonly<{ widget: WidgetOf<"bangumi.collection"> }>) {
  return (
    <PlatformMetrics
      items={[
        { label: "条目", value: widget.data.entries.toLocaleString("zh-CN") },
        { label: "看过", value: widget.data.watched },
        { label: "在看", value: widget.data.watching },
        { label: "短评", value: widget.data.reviews }
      ]}
    />
  );
}
