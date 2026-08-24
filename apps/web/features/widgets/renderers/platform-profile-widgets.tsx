import type { ReactNode } from "react";

import type { WidgetOf } from "../widget-types";
import { presentationToggle } from "../widget-presentation";

interface MetricItem {
  readonly label: string;
  readonly value: ReactNode;
}

function PlatformMetrics({ items }: Readonly<{ items: readonly MetricItem[] }>) {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] font-semibold text-ink-muted">
        未选择展示字段
      </div>
    );
  }
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
        ...(presentationToggle(widget.presentationConfig, "showRepositories")
          ? [{ label: "仓库", value: widget.data.repositories }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showStars")
          ? [{ label: "Star", value: widget.data.stars.toLocaleString("zh-CN") }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showFollowers")
          ? [{ label: "关注", value: widget.data.followers.toLocaleString("zh-CN") }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showContributions")
          ? [{ label: "贡献", value: widget.data.contributions.toLocaleString("zh-CN") }]
          : [])
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
        ...(presentationToggle(widget.presentationConfig, "showFollowing")
          ? [{ label: "关注", value: widget.data.following }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showFollowers")
          ? [{ label: "粉丝", value: widget.data.followers.toLocaleString("zh-CN") }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showViews")
          ? [{ label: "播放", value: `${(widget.data.views / 1000).toFixed(1)}K` }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showLikes")
          ? [{ label: "获赞", value: widget.data.likes.toLocaleString("zh-CN") }]
          : [])
      ]}
    />
  );
}

export function SteamProfileWidget({ widget }: Readonly<{ widget: WidgetOf<"steam.profile"> }>) {
  return (
    <PlatformMetrics
      items={[
        ...(presentationToggle(widget.presentationConfig, "showGames")
          ? [{ label: "游戏", value: widget.data.games }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showPlaytime")
          ? [
              {
                label: "游戏时长",
                value: `${widget.data.playtimeHours.toLocaleString("zh-CN")} h`
              }
            ]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showAchievements")
          ? [{ label: "成就", value: widget.data.achievements.toLocaleString("zh-CN") }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showScreenshots")
          ? [{ label: "截图", value: widget.data.screenshots.toLocaleString("zh-CN") }]
          : [])
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
        ...(presentationToggle(widget.presentationConfig, "showEntries")
          ? [{ label: "条目", value: widget.data.entries.toLocaleString("zh-CN") }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showWatched")
          ? [{ label: "看过", value: widget.data.watched }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showWatching")
          ? [{ label: "在看", value: widget.data.watching }]
          : []),
        ...(presentationToggle(widget.presentationConfig, "showReviews")
          ? [{ label: "短评", value: widget.data.reviews }]
          : [])
      ]}
    />
  );
}
