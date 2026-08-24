import type {
  DashboardReadModel,
  Profile,
  ResponsiveLayout,
  WidgetProjection,
  WidgetType
} from "@nivalis/api-client";

import type { WidgetOf } from "../widgets/widget-types";

export const mockProfile: Profile = {
  avatarUrl: "/images/mock-avatar-profile.webp",
  bio: "把可靠的系统边界和有温度的界面，编织成长期可维护的产品。",
  displayName: "Nivalis",
  handle: "@nivalis",
  headline: "全栈开发者 / ACG 爱好者",
  tags: ["Coding", "Music", "Photography", "Anime"]
};

const updatedAt = "2026-08-23T04:30:00Z";

const mockWidgetTemplates = [
  {
    id: "profile-main",
    type: "profile.hero",
    schemaVersion: 1,
    title: "Profile",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: mockProfile
  },
  {
    id: "stat-uptime",
    type: "system.stats",
    schemaVersion: 1,
    title: "累计运行天数",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { metric: "uptime_days", unit: "days", value: 427 }
  },
  {
    id: "stat-providers",
    type: "system.stats",
    schemaVersion: 1,
    title: "接入平台数",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { metric: "providers_connected", unit: "providers", value: 5 }
  },
  {
    id: "stat-sync",
    type: "system.stats",
    schemaVersion: 1,
    title: "数据同步",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { metric: "sync_completeness", unit: "percent", value: 100 }
  },
  {
    id: "stat-records",
    type: "system.stats",
    schemaVersion: 1,
    title: "收集数据量",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { metric: "records_collected", unit: "records", value: 128_893 }
  },
  {
    id: "netease-overview",
    type: "music.netease.overview",
    schemaVersion: 1,
    title: "网易云音乐",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: { range: "7d", showArtists: true, showGenres: true },
    data: {
      range: "7d",
      plays: 243,
      minutes: 1_823,
      dailyAverage: 260,
      change: 0.12,
      topArtists: [
        { name: "米津玄师", avatarUrl: "/images/mock-avatar-artist-1.webp" },
        { name: "黒羽", avatarUrl: "/images/mock-avatar-artist-2.webp" },
        { name: "Aimer", avatarUrl: "/images/mock-avatar-artist-3.webp" }
      ],
      genres: [
        { name: "流行", share: 0.4 },
        { name: "摇滚", share: 0.26 },
        { name: "ACG", share: 0.16 },
        { name: "电子", share: 0.1 },
        { name: "其他", share: 0.08 }
      ],
      trend: [
        { label: "05/14", value: 410 },
        { label: "05/15", value: 335 },
        { label: "05/16", value: 390 },
        { label: "05/17", value: 310 },
        { label: "05/18", value: 630 },
        { label: "05/19", value: 330 },
        { label: "05/20", value: 395 }
      ]
    }
  },
  {
    id: "github-profile",
    type: "github.profile",
    schemaVersion: 1,
    title: "GitHub",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: {
      handle: "@nivalis",
      repositories: 86,
      stars: 1_248,
      followers: 133,
      contributions: 2_860
    }
  },
  {
    id: "bilibili-profile",
    type: "bilibili.profile",
    schemaVersion: 1,
    title: "Bilibili",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { level: 6, following: 86, followers: 1_293, views: 67_700, likes: 2_341 }
  },
  {
    id: "steam-profile",
    type: "steam.profile",
    schemaVersion: 1,
    title: "Steam",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { level: 32, games: 126, playtimeHours: 1_456, achievements: 3_314, screenshots: 3_214 }
  },
  {
    id: "bangumi-collection",
    type: "bangumi.collection",
    schemaVersion: 1,
    title: "Bangumi",
    updatedAt,
    stale: false,
    enabled: true,
    dataConfig: {},
    data: { level: 5, entries: 2_341, watched: 12, watching: 389, reviews: 7 }
  }
];

export const mockWidgets = mockWidgetTemplates.map((widget) => ({
  ...widget,
  dataConfig:
    widget.type === "music.netease.overview"
      ? { range: widget.dataConfig.range }
      : widget.dataConfig,
  presentationConfig:
    widget.type === "music.netease.overview"
      ? { showArtists: true, showGenres: true, showTrend: true }
      : {},
  provider: "fixture" as const
})) as WidgetProjection[];

export const mockLayout: ResponsiveLayout = {
  lg: [
    { i: "profile-main", x: 0, y: 0, w: 7, h: 3 },
    { i: "stat-uptime", x: 0, y: 3, w: 3, h: 2 },
    { i: "stat-providers", x: 3, y: 3, w: 3, h: 2 },
    { i: "stat-sync", x: 6, y: 3, w: 3, h: 2 },
    { i: "stat-records", x: 9, y: 3, w: 3, h: 2 },
    { i: "netease-overview", x: 0, y: 5, w: 8, h: 6 },
    { i: "github-profile", x: 8, y: 5, w: 4, h: 3 },
    { i: "bilibili-profile", x: 8, y: 8, w: 4, h: 3 },
    { i: "steam-profile", x: 0, y: 11, w: 6, h: 3 },
    { i: "bangumi-collection", x: 6, y: 11, w: 6, h: 3 }
  ],
  md: [
    { i: "profile-main", x: 0, y: 0, w: 5, h: 3 },
    { i: "stat-uptime", x: 0, y: 3, w: 2, h: 2 },
    { i: "stat-providers", x: 2, y: 3, w: 2, h: 2 },
    { i: "stat-sync", x: 4, y: 3, w: 2, h: 2 },
    { i: "stat-records", x: 6, y: 3, w: 2, h: 2 },
    { i: "netease-overview", x: 0, y: 5, w: 5, h: 6 },
    { i: "github-profile", x: 5, y: 5, w: 3, h: 3 },
    { i: "bilibili-profile", x: 5, y: 8, w: 3, h: 3 },
    { i: "steam-profile", x: 0, y: 11, w: 4, h: 3 },
    { i: "bangumi-collection", x: 4, y: 11, w: 4, h: 3 }
  ],
  sm: [
    { i: "profile-main", x: 0, y: 0, w: 4, h: 4 },
    { i: "stat-uptime", x: 0, y: 4, w: 2, h: 2 },
    { i: "stat-providers", x: 2, y: 4, w: 2, h: 2 },
    { i: "stat-sync", x: 0, y: 6, w: 2, h: 2 },
    { i: "stat-records", x: 2, y: 6, w: 2, h: 2 },
    { i: "netease-overview", x: 0, y: 8, w: 4, h: 12 },
    { i: "github-profile", x: 0, y: 20, w: 4, h: 4 },
    { i: "bilibili-profile", x: 0, y: 24, w: 4, h: 4 },
    { i: "steam-profile", x: 0, y: 28, w: 4, h: 4 },
    { i: "bangumi-collection", x: 0, y: 32, w: 4, h: 4 }
  ]
};

export const mockDashboard: DashboardReadModel = {
  dashboardId: "about",
  revision: 42,
  profile: mockProfile,
  layout: mockLayout,
  widgets: mockWidgets
};

const cloneWidget = <T extends WidgetProjection>(widget: T, id: string): T => ({
  ...widget,
  id,
  title: `${widget.title} · 新实例`
});

export function createMockWidget(
  type: WidgetType,
  id: string,
  schemaVersion = 1
): WidgetProjection {
  if (type === "music.netease.overview" && schemaVersion === 2) {
    const unavailable = { availability: "unavailable" as const, reason: "not_synced" as const };
    return {
      data: {
        account: unavailable,
        listeningDuration: unavailable,
        provider: "netease",
        recentListening: unavailable,
        totalListenCount: unavailable,
        trend: unavailable,
        weeklyListening: unavailable
      },
      dataConfig: { range: "7d" },
      enabled: true,
      id,
      presentationConfig: { showArtists: true, showTrend: true },
      provider: "netease",
      schemaVersion: 2,
      stale: true,
      title: "网易云音乐 · 新实例",
      type,
      updatedAt
    };
  }
  if (type === "music.netease.identity") {
    return {
      data: {
        medals: { availability: "available", items: [], obtainedCount: 0 },
        profile: {
          availability: "available",
          avatarUrl: "/images/mock-avatar-profile.webp",
          displayName: "Nivalis Fixture",
          followerCount: 128,
          followingCount: 36,
          level: 10,
          playlistCount: 8
        },
        provider: "netease",
        publicFields: [
          "display_name",
          "avatar",
          "level",
          "vip",
          "following_count",
          "follower_count",
          "playlist_count"
        ],
        socialStatus: { availability: "unavailable", reason: "provider_omitted" },
        vip: {
          active: true,
          availability: "available",
          memberships: [],
          redVipAnnualCount: 1,
          redVipLevel: 6
        }
      },
      dataConfig: {
        medalLimit: 3,
        publicFields: [
          "display_name",
          "avatar",
          "level",
          "vip",
          "following_count",
          "follower_count",
          "playlist_count"
        ]
      },
      enabled: true,
      id,
      presentationConfig: {},
      provider: "netease",
      schemaVersion: 1,
      stale: true,
      title: "网易云 · 身份档案",
      type,
      updatedAt
    } as WidgetOf<"music.netease.identity">;
  }
  if (type === "music.netease.listening") {
    const metric = (
      value: number,
      unit: "plays" | "seconds" | "minutes",
      period: "all_time" | "provider_week"
    ) => ({
      availability: "available" as const,
      period,
      provenance: "provider_reported" as const,
      unit,
      value
    });
    return {
      data: {
        provider: "netease",
        publicFields: ["total_count", "total_duration", "weekly_duration", "trend"],
        totalListenCount: metric(6421, "plays", "all_time"),
        totalListeningDuration: metric(582420, "seconds", "all_time"),
        trend: { availability: "unavailable", reason: "not_synced" },
        weeklyListeningDuration: metric(91, "minutes", "provider_week")
      },
      dataConfig: {
        publicFields: ["total_count", "total_duration", "weekly_duration", "trend"]
      },
      enabled: true,
      id,
      presentationConfig: {},
      provider: "netease",
      schemaVersion: 1,
      stale: true,
      title: "网易云 · 收听足迹",
      type,
      updatedAt
    } as WidgetOf<"music.netease.listening">;
  }
  if (type === "music.netease.ranking") {
    return {
      data: {
        availability: "available",
        coverage: "provider_top_100",
        items: [],
        provider: "netease",
        publicLimit: 10,
        range: "week",
        totalAvailable: 0
      },
      dataConfig: { publicLimit: 10, range: "week" },
      enabled: true,
      id,
      presentationConfig: {},
      provider: "netease",
      schemaVersion: 1,
      stale: true,
      title: "网易云 · 听歌排行",
      type,
      updatedAt
    } as WidgetOf<"music.netease.ranking">;
  }
  if (type === "music.netease.social") {
    const hidden = { availability: "unavailable" as const, reason: "not_public" as const };
    return {
      data: {
        followerCount: 128,
        followers: hidden,
        following: hidden,
        followingCount: 36,
        provider: "netease",
        publicLimit: 0,
        publicLists: []
      },
      dataConfig: { publicLimit: 0, publicLists: [] },
      enabled: true,
      id,
      presentationConfig: {},
      provider: "netease",
      schemaVersion: 1,
      stale: true,
      title: "网易云 · 乐友关系",
      type,
      updatedAt
    } as WidgetOf<"music.netease.social">;
  }
  if (type === "music.netease.playlists") {
    return {
      data: {
        availability: "available",
        complete: true,
        items: [],
        provider: "netease",
        providerTotal: 0,
        publicLimit: 6
      },
      dataConfig: { publicLimit: 6 },
      enabled: true,
      id,
      presentationConfig: {},
      provider: "netease",
      schemaVersion: 1,
      stale: true,
      title: "网易云 · 创建歌单",
      type,
      updatedAt
    } as WidgetOf<"music.netease.playlists">;
  }
  if (type === "music.netease.showcase") {
    return {
      data: {
        availability: "unavailable",
        provider: "netease",
        reason: "resource_not_found",
        source: "all_time_track"
      },
      dataConfig: { source: "all_time_track" },
      enabled: true,
      id,
      presentationConfig: {},
      provider: "netease",
      schemaVersion: 1,
      stale: true,
      title: "网易云 · 音乐名片",
      type,
      updatedAt
    } as WidgetOf<"music.netease.showcase">;
  }
  if (type === "system.stats") {
    const metrics: WidgetOf<"system.stats">["data"]["metric"][] = [
      "uptime_days",
      "providers_connected",
      "sync_completeness",
      "records_collected"
    ];
    const metric = metrics[Number(id.slice(-1)) % metrics.length] ?? "records_collected";
    const units: Record<
      WidgetOf<"system.stats">["data"]["metric"],
      WidgetOf<"system.stats">["data"]["unit"]
    > = {
      uptime_days: "days",
      providers_connected: "providers",
      sync_completeness: "percent",
      records_collected: "records"
    };
    return {
      ...mockWidgets.find((widget) => widget.type === type),
      id,
      type,
      schemaVersion: 1,
      title: "统计信息 · 新实例",
      updatedAt,
      stale: false,
      enabled: true,
      dataConfig: {},
      data: { metric, unit: units[metric], value: metric === "sync_completeness" ? 100 : 24 }
    } as WidgetOf<"system.stats">;
  }

  const template = mockWidgets.find((widget) => widget.type === type);
  if (!template) {
    throw new Error(`No Phase 1 mock template exists for ${type}.`);
  }
  return cloneWidget(template, id);
}
