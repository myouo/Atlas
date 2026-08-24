import type { WidgetProjection, WidgetType } from "@nivalis/api-client";
import { Books, ChartLineUp, UserCircle } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { SiBilibili, SiGithub, SiNeteasecloudmusic, SiSteam } from "react-icons/si";

import type { ModuleShellKind, WidgetAccent } from "../../design-system/module-shell";
import type { WidgetGridSizes } from "../dashboard/layout-engine";
import { NeteaseOverviewWidget } from "./renderers/netease-overview-widget";
import {
  BangumiCollectionWidget,
  BilibiliProfileWidget,
  GithubProfileWidget,
  SteamProfileWidget
} from "./renderers/platform-profile-widgets";
import { ProfileHeroWidget } from "./renderers/profile-hero-widget";
import { SystemStatWidget } from "./renderers/system-stat-widget";
import type { WidgetOf } from "./widget-types";

interface RegistryIconProps {
  readonly className?: string;
  readonly size?: number | string;
}

export interface WidgetDefinition {
  readonly accent: WidgetAccent;
  readonly allowMultiple: boolean;
  readonly catalogVisible?: boolean;
  readonly description: string;
  readonly Icon: ComponentType<RegistryIconProps>;
  readonly kind: ModuleShellKind;
  readonly name: string;
  readonly Renderer: ComponentType<{ readonly widget: WidgetProjection }>;
  readonly schemaVersion: number;
  readonly sizes: WidgetGridSizes;
  readonly subtitle?: (widget: WidgetProjection) => string | undefined;
  readonly type: WidgetType;
}

function adaptRenderer<TType extends WidgetType>(
  Renderer: ComponentType<{ readonly widget: WidgetOf<TType> }>
): ComponentType<{ readonly widget: WidgetProjection }> {
  return function RegisteredRenderer({ widget }) {
    return <Renderer widget={widget as WidgetOf<TType>} />;
  };
}

export class WidgetRegistry {
  private readonly definitions = new Map<string, WidgetDefinition>();

  register(definition: WidgetDefinition) {
    const key = this.key(definition.type, definition.schemaVersion);
    if (this.definitions.has(key)) {
      throw new Error(`Widget renderer already registered for ${key}.`);
    }
    this.definitions.set(key, definition);
    return this;
  }

  resolve(type: string, schemaVersion: number) {
    return this.definitions.get(this.key(type, schemaVersion));
  }

  list() {
    return [...this.definitions.values()].filter(
      (definition) => definition.catalogVisible !== false
    );
  }

  preferred(type: WidgetType) {
    return this.list()
      .filter((definition) => definition.type === type)
      .sort((left, right) => right.schemaVersion - left.schemaVersion)[0];
  }

  private key(type: string, schemaVersion: number) {
    return `${type}@${schemaVersion}`;
  }
}

const platformSizes: WidgetGridSizes = {
  lg: { w: 4, h: 3, minW: 3, minH: 3 },
  md: { w: 3, h: 3, minW: 3, minH: 3 },
  sm: { w: 4, h: 4, minW: 4, minH: 4 }
};

export const widgetRegistry = new WidgetRegistry()
  .register({
    type: "profile.hero",
    schemaVersion: 1,
    name: "个人档案",
    description: "头像、身份标签与个人简介",
    Icon: UserCircle,
    accent: "blue",
    kind: "hero",
    allowMultiple: false,
    sizes: {
      lg: { w: 7, h: 3, minW: 5, minH: 3 },
      md: { w: 5, h: 3, minW: 4, minH: 3 },
      sm: { w: 4, h: 4, minW: 4, minH: 4 }
    },
    Renderer: adaptRenderer(ProfileHeroWidget)
  })
  .register({
    type: "system.stats",
    schemaVersion: 1,
    name: "统计信息",
    description: "运行、平台、同步或数据量指标",
    Icon: ChartLineUp,
    accent: "blue",
    kind: "stat",
    allowMultiple: true,
    sizes: {
      lg: { w: 3, h: 2, minW: 2, minH: 2 },
      md: { w: 2, h: 2, minW: 2, minH: 2 },
      sm: { w: 2, h: 2, minW: 2, minH: 2 }
    },
    Renderer: adaptRenderer(SystemStatWidget)
  })
  .register({
    type: "music.netease.overview",
    schemaVersion: 1,
    name: "网易云音乐",
    description: "播放、时长、偏好与趋势概览",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    catalogVisible: false,
    sizes: {
      lg: { w: 8, h: 6, minW: 6, minH: 5 },
      md: { w: 5, h: 6, minW: 5, minH: 5 },
      sm: { w: 4, h: 12, minW: 4, minH: 10 }
    },
    subtitle: () => "Legacy Fixture Projection",
    Renderer: adaptRenderer(NeteaseOverviewWidget)
  })
  .register({
    type: "music.netease.overview",
    schemaVersion: 2,
    name: "网易云音乐",
    description: "真实 Provider 计数、周排行、最近播放与可用性",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    sizes: {
      lg: { w: 8, h: 6, minW: 6, minH: 5 },
      md: { w: 5, h: 6, minW: 5, minH: 5 },
      sm: { w: 4, h: 12, minW: 4, minH: 10 }
    },
    subtitle: (widget) =>
      widget.type === "music.netease.overview" && widget.schemaVersion === 2
        ? widget.data.account.availability === "available"
          ? `网易云 · ${widget.data.account.displayName ?? widget.data.account.providerUserId}`
          : "网易云 · 尚未同步"
        : undefined,
    Renderer: adaptRenderer(NeteaseOverviewWidget)
  })
  .register({
    type: "github.profile",
    schemaVersion: 1,
    name: "GitHub",
    description: "仓库、Star、关注与贡献",
    Icon: SiGithub,
    accent: "ink",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    subtitle: (widget) => (widget.type === "github.profile" ? widget.data.handle : undefined),
    Renderer: adaptRenderer(GithubProfileWidget)
  })
  .register({
    type: "bilibili.profile",
    schemaVersion: 1,
    name: "Bilibili",
    description: "等级、粉丝、播放与获赞",
    Icon: SiBilibili,
    accent: "rose",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    subtitle: (widget) =>
      widget.type === "bilibili.profile" ? `等级 Lv.${widget.data.level}` : undefined,
    Renderer: adaptRenderer(BilibiliProfileWidget)
  })
  .register({
    type: "steam.profile",
    schemaVersion: 1,
    name: "Steam",
    description: "游戏、时长、成就与截图",
    Icon: SiSteam,
    accent: "ink",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    subtitle: (widget) =>
      widget.type === "steam.profile" ? `等级 ${widget.data.level}` : undefined,
    Renderer: adaptRenderer(SteamProfileWidget)
  })
  .register({
    type: "bangumi.collection",
    schemaVersion: 1,
    name: "Bangumi",
    description: "收藏、看过、在看与短评",
    Icon: Books,
    accent: "rose",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    subtitle: (widget) =>
      widget.type === "bangumi.collection" ? `等级 Lv.${widget.data.level}` : undefined,
    Renderer: adaptRenderer(BangumiCollectionWidget)
  });
