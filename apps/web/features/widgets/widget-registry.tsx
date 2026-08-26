import type { WidgetProjection, WidgetType } from "@nivalis/api-client";
import { Books, ChartLineUp, UserCircle } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { SiBilibili, SiGithub, SiNeteasecloudmusic, SiSteam } from "react-icons/si";

import type { ModuleShellKind, WidgetAccent } from "../../design-system/module-shell";
import type { WidgetGridSizes } from "../dashboard/layout-engine";
import { NeteaseOverviewWidget } from "./renderers/netease-overview-widget";
import {
  NeteaseIdentityWidget,
  NeteaseListeningWidget,
  NeteasePlaylistsWidget,
  NeteaseRankingWidget,
  NeteaseShowcaseWidget,
  NeteaseSocialWidget
} from "./renderers/netease-data-widgets";
import {
  BangumiCollectionWidget,
  BilibiliProfileWidget,
  GithubProfileWidget,
  SteamProfileWidget
} from "./renderers/platform-profile-widgets";
import { ProfileHeroWidget } from "./renderers/profile-hero-widget";
import { SystemStatWidget } from "./renderers/system-stat-widget";
import type { WidgetOf } from "./widget-types";
import type { WidgetPresentationControl } from "./widget-presentation";

interface RegistryIconProps {
  readonly className?: string;
  readonly size?: number | string;
}

export interface WidgetDefinition {
  readonly accent: WidgetAccent;
  readonly allowMultiple: boolean;
  readonly catalogVisible?: boolean;
  readonly description: string;
  readonly dataPresets?: readonly WidgetDataPreset[];
  readonly expandable?: boolean;
  readonly Icon: ComponentType<RegistryIconProps>;
  readonly kind: ModuleShellKind;
  readonly name: string;
  readonly Renderer: ComponentType<{ readonly widget: WidgetProjection }>;
  readonly schemaVersion: number;
  readonly sizes: WidgetGridSizes;
  readonly presentationControls?: readonly WidgetPresentationControl[];
  readonly resourcePicker?: "netease-showcase" | "netease-showcase-gallery";
  readonly type: WidgetType;
}

export interface WidgetDataPreset {
  readonly dataConfig: WidgetProjection["dataConfig"];
  readonly description: string;
  readonly id: string;
  readonly label: string;
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

const toggle = (
  key: string,
  label: string,
  description: string,
  defaultValue = true
): WidgetPresentationControl => ({ defaultValue, description, key, kind: "toggle", label });

const metricControls = {
  bangumi: [
    toggle("showEntries", "收藏条目", "显示收藏条目总数"),
    toggle("showWatched", "看过", "显示看过条目数"),
    toggle("showWatching", "在看", "显示正在观看的条目数"),
    toggle("showReviews", "短评", "显示短评数量")
  ],
  bilibili: [
    toggle("showFollowing", "关注", "显示关注数量"),
    toggle("showFollowers", "粉丝", "显示粉丝数量"),
    toggle("showViews", "播放", "显示累计播放量"),
    toggle("showLikes", "获赞", "显示累计获赞数")
  ],
  github: [
    toggle("showRepositories", "仓库", "显示公开仓库数量"),
    toggle("showStars", "Star", "显示仓库 Star 汇总"),
    toggle("showFollowers", "关注者", "显示关注者数量"),
    toggle("showContributions", "贡献", "显示贡献统计")
  ],
  steam: [
    toggle("showGames", "游戏", "显示游戏数量"),
    toggle("showPlaytime", "游戏时长", "显示累计游戏时长"),
    toggle("showAchievements", "成就", "显示成就数量"),
    toggle("showScreenshots", "截图", "显示截图数量")
  ]
} as const;

export const widgetRegistry = new WidgetRegistry()
  .register({
    type: "profile.hero",
    schemaVersion: 1,
    name: "个人档案",
    description: "头像、身份与简介",
    Icon: UserCircle,
    accent: "blue",
    kind: "hero",
    allowMultiple: false,
    sizes: {
      lg: { w: 7, h: 3, minW: 5, minH: 3 },
      md: { w: 5, h: 3, minW: 4, minH: 3 },
      sm: { w: 4, h: 4, minW: 4, minH: 4 }
    },
    presentationControls: [
      toggle("showAvatar", "头像", "显示个人头像"),
      toggle("showDisplayName", "显示名称", "显示个人显示名称"),
      toggle("showHandle", "账号标识", "显示个人 Handle"),
      toggle("showHeadline", "身份标题", "显示个人 Headline"),
      toggle("showBio", "个人简介", "显示 Bio 简介"),
      toggle("showTags", "标签", "显示身份与兴趣标签"),
      toggle("showBadge", "身份徽标", "显示开发者徽标")
    ],
    Renderer: adaptRenderer(ProfileHeroWidget)
  })
  .register({
    type: "system.stats",
    schemaVersion: 1,
    name: "统计信息",
    description: "关键统计指标",
    Icon: ChartLineUp,
    accent: "blue",
    kind: "stat",
    allowMultiple: true,
    sizes: {
      lg: { w: 3, h: 2, minW: 2, minH: 2 },
      md: { w: 2, h: 2, minW: 2, minH: 2 },
      sm: { w: 2, h: 2, minW: 2, minH: 2 }
    },
    presentationControls: [
      toggle("showLabel", "指标名称", "显示统计指标名称"),
      toggle("showValue", "指标值", "显示统计数值"),
      toggle("showUnit", "单位", "显示天、条、百分比等单位"),
      toggle("showIcon", "图标", "显示统计卡片图标")
    ],
    Renderer: adaptRenderer(SystemStatWidget)
  })
  .register({
    type: "music.netease.overview",
    schemaVersion: 1,
    name: "网易云音乐",
    description: "音乐数据概览",
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
    Renderer: adaptRenderer(NeteaseOverviewWidget)
  })
  .register({
    type: "music.netease.identity",
    schemaVersion: 1,
    name: "网易云 · 身份档案",
    description: "等级、VIP 与账号信息",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    expandable: true,
    sizes: {
      lg: { w: 5, h: 5, minW: 4, minH: 4 },
      md: { w: 4, h: 5, minW: 4, minH: 4 },
      sm: { w: 4, h: 7, minW: 4, minH: 6 }
    },
    dataPresets: [
      {
        id: "identity-minimal",
        label: "轻量身份",
        description: "只公开头像、昵称、等级与 VIP 状态",
        dataConfig: {
          medalLimit: 0,
          publicFields: ["display_name", "avatar", "level", "vip"]
        }
      },
      {
        id: "identity-social",
        label: "社交名片",
        description: "增加关注、粉丝、歌单计数和佩戴徽章",
        dataConfig: {
          medalLimit: 3,
          publicFields: [
            "display_name",
            "avatar",
            "avatar_decoration",
            "level",
            "vip",
            "following_count",
            "follower_count",
            "playlist_count",
            "medals",
            "social_status"
          ]
        }
      },
      {
        id: "identity-full",
        label: "完整公开档案",
        description: "公开签名、事件数、UID 与最多 8 枚徽章",
        dataConfig: {
          medalLimit: 8,
          publicFields: [
            "display_name",
            "avatar",
            "avatar_decoration",
            "signature",
            "level",
            "vip",
            "following_count",
            "follower_count",
            "playlist_count",
            "event_count",
            "medals",
            "social_status",
            "provider_user_id"
          ]
        }
      }
    ],
    Renderer: adaptRenderer(NeteaseIdentityWidget)
  })
  .register({
    type: "music.netease.listening",
    schemaVersion: 1,
    name: "网易云 · 收听足迹",
    description: "听歌次数、时长与趋势",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    sizes: {
      lg: { w: 7, h: 4, minW: 5, minH: 4 },
      md: { w: 4, h: 4, minW: 4, minH: 4 },
      sm: { w: 4, h: 6, minW: 4, minH: 5 }
    },
    dataPresets: [
      {
        id: "listening-summary",
        label: "核心统计",
        description: "公开累计听歌、累计时长和本周时长",
        dataConfig: { publicFields: ["total_count", "total_duration", "weekly_duration"] }
      },
      {
        id: "listening-story",
        label: "完整足迹",
        description: "增加官方周期趋势，适合宽卡片",
        dataConfig: {
          publicFields: ["total_count", "total_duration", "weekly_duration", "trend"]
        }
      },
      {
        id: "listening-duration",
        label: "只展示时长",
        description: "不公开累计听歌首数，只展示累计与本周时长",
        dataConfig: { publicFields: ["total_duration", "weekly_duration"] }
      }
    ],
    Renderer: adaptRenderer(NeteaseListeningWidget)
  })
  .register({
    type: "music.netease.ranking",
    schemaVersion: 1,
    name: "网易云 · 听歌排行",
    description: "周榜或总榜",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    catalogVisible: false,
    expandable: true,
    sizes: {
      lg: { w: 5, h: 6, minW: 4, minH: 5 },
      md: { w: 4, h: 6, minW: 4, minH: 5 },
      sm: { w: 4, h: 9, minW: 4, minH: 7 }
    },
    dataPresets: [
      {
        id: "ranking-week-5",
        label: "本周 Top 5",
        description: "公开最近一周前 5 首",
        dataConfig: { publicLimit: 5, range: "week" }
      },
      {
        id: "ranking-week-10",
        label: "本周 Top 10",
        description: "公开最近一周前 10 首",
        dataConfig: { publicLimit: 10, range: "week" }
      },
      {
        id: "ranking-all-10",
        label: "全部时间 Top 10",
        description: "公开全部时间前 10 首",
        dataConfig: { publicLimit: 10, range: "all_time" }
      }
    ],
    Renderer: adaptRenderer(NeteaseRankingWidget)
  })
  .register({
    type: "music.netease.ranking",
    schemaVersion: 2,
    name: "网易云 · 听歌双榜",
    description: "周榜与总榜",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    expandable: true,
    sizes: {
      lg: { w: 7, h: 6, minW: 5, minH: 5 },
      md: { w: 5, h: 6, minW: 4, minH: 5 },
      sm: { w: 4, h: 7, minW: 4, minH: 6 }
    },
    dataPresets: [
      {
        id: "ranking-both-12",
        label: "双榜 Top 12",
        description: "周榜与总榜都公开，访客可在卡片内切换",
        dataConfig: { publicLimit: 12, publicRanges: ["week", "all_time"] }
      },
      {
        id: "ranking-week-12",
        label: "仅最近一周",
        description: "只公开最近一周排行",
        dataConfig: { publicLimit: 12, publicRanges: ["week"] }
      },
      {
        id: "ranking-all-12",
        label: "仅全部时间",
        description: "只公开全部时间排行",
        dataConfig: { publicLimit: 12, publicRanges: ["all_time"] }
      }
    ],
    presentationControls: [
      {
        defaultValue: "editorial",
        description: "精选模式突出前三名；紧凑模式适合较小卡片",
        key: "rankingStyle",
        kind: "select",
        label: "排行样式",
        options: [
          { label: "精选榜单", value: "editorial" },
          { label: "紧凑列表", value: "compact" }
        ]
      },
      toggle("showPlayCount", "播放次数", "显示每首歌的 Provider 播放次数")
    ],
    Renderer: adaptRenderer(NeteaseRankingWidget)
  })
  .register({
    type: "music.netease.social",
    schemaVersion: 1,
    name: "网易云 · 关注 / 粉丝",
    description: "以独立实例展示关注或粉丝，也兼容合并视图",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    catalogVisible: false,
    sizes: {
      lg: { w: 5, h: 5, minW: 4, minH: 4 },
      md: { w: 4, h: 5, minW: 4, minH: 4 },
      sm: { w: 4, h: 8, minW: 4, minH: 6 }
    },
    dataPresets: [
      {
        id: "social-counts",
        label: "仅公开计数",
        description: "列表保持私有，只展示关注与粉丝数量",
        dataConfig: { publicLimit: 0, publicLists: [], view: "combined" }
      },
      {
        id: "social-following",
        label: "公开关注",
        description: "公开最多 8 个关注账号；粉丝列表保持私有",
        dataConfig: { publicLimit: 8, publicLists: ["following"], view: "following" }
      },
      {
        id: "social-followers",
        label: "公开粉丝",
        description: "公开最多 8 个粉丝账号；关注列表保持私有",
        dataConfig: { publicLimit: 8, publicLists: ["followers"], view: "followers" }
      },
      {
        id: "social-both",
        label: "双向社交预览",
        description: "关注和粉丝各公开最多 8 个账号",
        dataConfig: {
          publicLimit: 8,
          publicLists: ["following", "followers"],
          view: "combined"
        }
      }
    ],
    Renderer: adaptRenderer(NeteaseSocialWidget)
  })
  .register({
    type: "music.netease.playlists",
    schemaVersion: 1,
    name: "网易云 · 创建歌单",
    description: "公开创建的歌单",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    expandable: true,
    sizes: {
      lg: { w: 7, h: 5, minW: 5, minH: 4 },
      md: { w: 4, h: 5, minW: 4, minH: 4 },
      sm: { w: 4, h: 8, minW: 4, minH: 6 }
    },
    dataPresets: [
      {
        id: "playlists-2",
        label: "精选 2 个",
        description: "适合紧凑主页",
        dataConfig: { publicLimit: 2 }
      },
      {
        id: "playlists-6",
        label: "歌单橱窗",
        description: "公开前 6 个创建歌单",
        dataConfig: { publicLimit: 6 }
      },
      {
        id: "playlists-private",
        label: "暂不公开列表",
        description: "保留卡片与计数语义，不返回歌单条目",
        dataConfig: { publicLimit: 0 }
      }
    ],
    Renderer: adaptRenderer(NeteasePlaylistsWidget)
  })
  .register({
    type: "music.netease.showcase",
    schemaVersion: 1,
    name: "网易云 · 单项名片",
    description: "单项音乐展示",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    catalogVisible: false,
    sizes: {
      lg: { w: 6, h: 4, minW: 4, minH: 4 },
      md: { w: 4, h: 4, minW: 4, minH: 4 },
      sm: { w: 4, h: 6, minW: 4, minH: 5 }
    },
    dataPresets: [
      {
        id: "showcase-all",
        label: "长期最爱",
        description: "展示全部时间排名第一的歌曲",
        dataConfig: { source: "all_time_track" }
      },
      {
        id: "showcase-week",
        label: "本周最爱",
        description: "展示最近一周排名第一的歌曲",
        dataConfig: { source: "weekly_track" }
      },
      {
        id: "showcase-playlist",
        label: "创建歌单",
        description: "展示第一个创建歌单；可在完整数据入口继续精确选择",
        dataConfig: { source: "created_playlist" }
      },
      {
        id: "showcase-medal",
        label: "乐迷徽章",
        description: "展示最近获得或正在佩戴的徽章",
        dataConfig: { source: "medal" }
      }
    ],
    resourcePicker: "netease-showcase",
    Renderer: adaptRenderer(NeteaseShowcaseWidget)
  })
  .register({
    type: "music.netease.showcase",
    schemaVersion: 2,
    name: "网易云 · 音乐展柜",
    description: "主页音乐卡片",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: false,
    sizes: {
      lg: { w: 8, h: 6, minW: 6, minH: 5 },
      md: { w: 5, h: 7, minW: 4, minH: 6 },
      sm: { w: 4, h: 11, minW: 4, minH: 8 }
    },
    presentationControls: [
      {
        defaultValue: "editorial",
        description: "精选模式保留更强视觉层次；紧凑模式提高信息密度",
        key: "galleryStyle",
        kind: "select",
        label: "展柜排版",
        options: [
          { label: "精选展柜", value: "editorial" },
          { label: "紧凑展柜", value: "compact" }
        ]
      },
      toggle("showMeta", "资源说明", "显示歌曲播放次数、歌单曲目数或徽章状态")
    ],
    resourcePicker: "netease-showcase-gallery",
    Renderer: adaptRenderer(NeteaseShowcaseWidget)
  })
  .register({
    type: "music.netease.overview",
    schemaVersion: 2,
    name: "网易云音乐",
    description: "音乐数据概览",
    Icon: SiNeteasecloudmusic,
    accent: "coral",
    kind: "standard",
    allowMultiple: true,
    expandable: true,
    sizes: {
      lg: { w: 8, h: 6, minW: 6, minH: 5 },
      md: { w: 5, h: 6, minW: 5, minH: 5 },
      sm: { w: 4, h: 12, minW: 4, minH: 10 }
    },
    presentationControls: [
      toggle("showTotalListenCount", "累计听歌", "显示 Provider 报告的累计听歌数"),
      toggle("showListeningDuration", "本周时长", "显示本周收听分钟数"),
      toggle("showRankedPlayCount", "排行播放次数", "显示周榜记录的播放次数汇总"),
      toggle("showRecentCount", "最近记录数量", "显示最近播放记录数量"),
      toggle("showTopTracks", "Top Tracks", "显示本周歌曲排行"),
      toggle("showArtists", "Top Artists", "显示从周榜聚合的歌手排行"),
      {
        defaultValue: "4",
        description: "控制排行或最近播放区域最多展示几条记录",
        key: "listLimit",
        kind: "select",
        label: "列表条数",
        options: [
          { label: "2 条", value: "2" },
          { label: "4 条", value: "4" },
          { label: "6 条", value: "6" }
        ]
      },
      {
        defaultValue: "trend",
        description: "选择卡片右侧展示收听趋势、最近播放或不展示详情",
        key: "detailPanel",
        kind: "select",
        label: "详情区域",
        options: [
          { label: "收听趋势", value: "trend" },
          { label: "最近播放", value: "recent" },
          { label: "不展示", value: "none" }
        ]
      }
    ],
    Renderer: adaptRenderer(NeteaseOverviewWidget)
  })
  .register({
    type: "github.profile",
    schemaVersion: 1,
    name: "GitHub",
    description: "仓库与贡献",
    Icon: SiGithub,
    accent: "ink",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    presentationControls: metricControls.github,
    Renderer: adaptRenderer(GithubProfileWidget)
  })
  .register({
    type: "bilibili.profile",
    schemaVersion: 1,
    name: "Bilibili",
    description: "粉丝、播放与获赞",
    Icon: SiBilibili,
    accent: "rose",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    presentationControls: metricControls.bilibili,
    Renderer: adaptRenderer(BilibiliProfileWidget)
  })
  .register({
    type: "steam.profile",
    schemaVersion: 1,
    name: "Steam",
    description: "游戏、时长与成就",
    Icon: SiSteam,
    accent: "ink",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    presentationControls: metricControls.steam,
    Renderer: adaptRenderer(SteamProfileWidget)
  })
  .register({
    type: "bangumi.collection",
    schemaVersion: 1,
    name: "Bangumi",
    description: "收藏与观看进度",
    Icon: Books,
    accent: "rose",
    kind: "standard",
    allowMultiple: true,
    sizes: platformSizes,
    presentationControls: metricControls.bangumi,
    Renderer: adaptRenderer(BangumiCollectionWidget)
  });
