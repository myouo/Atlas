import type {
  DashboardDraftInput,
  Profile,
  ResponsiveLayout,
  WidgetProjection
} from "@nivalis/domain";

export const PHASE_TWO_OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const PHASE_TWO_PROFILE_ID = "00000000-0000-4000-8000-000000000100";
export const PHASE_TWO_DASHBOARD_ID = "00000000-0000-4000-8000-000000000200";
export const PHASE_TWO_DRAFT_STATE_ID = "00000000-0000-4000-8000-000000000301";
export const PHASE_TWO_PUBLISHED_STATE_ID = "00000000-0000-4000-8000-000000000302";
export const PHASE_THREE_INITIAL_REVISION_ID = "00000000-0000-4000-8000-000000000303";
export const PHASE_FOUR_FIXTURE_CONNECTION_ID = "00000000-0000-4000-8000-000000000400";
export const PHASE_FIVE_NETEASE_CONNECTION_ID = "00000000-0000-4000-8000-000000000401";

export const widgetIds = {
  profile: "00000000-0000-4000-8000-000000001001",
  uptime: "00000000-0000-4000-8000-000000001002",
  providers: "00000000-0000-4000-8000-000000001003",
  sync: "00000000-0000-4000-8000-000000001004",
  records: "00000000-0000-4000-8000-000000001005",
  netease: "00000000-0000-4000-8000-000000001006",
  github: "00000000-0000-4000-8000-000000001007",
  bilibili: "00000000-0000-4000-8000-000000001008",
  steam: "00000000-0000-4000-8000-000000001009",
  bangumi: "00000000-0000-4000-8000-000000001010"
} as const;

export const phaseTwoProfile: Profile = {
  avatarUrl: "/images/mock-avatar-profile.webp",
  bio: "把可靠的系统边界和有温度的界面，编织成长期可维护的产品。",
  displayName: "Nivalis",
  handle: "@nivalis",
  headline: "全栈开发者 / ACG 爱好者",
  tags: ["Coding", "Music", "Photography", "Anime"]
};

const fixtureUpdatedAt = new Date("2026-08-23T04:30:00.000Z");

const phaseWidgetTemplates = [
  {
    dataConfig: {},
    data: phaseTwoProfile,
    enabled: true,
    id: widgetIds.profile,
    schemaVersion: 1,
    stale: false,
    title: "Profile",
    type: "profile.hero",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: { metric: "uptime_days", unit: "days", value: 427 },
    enabled: true,
    id: widgetIds.uptime,
    schemaVersion: 1,
    stale: false,
    title: "累计运行天数",
    type: "system.stats",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: { metric: "providers_connected", unit: "providers", value: 5 },
    enabled: true,
    id: widgetIds.providers,
    schemaVersion: 1,
    stale: false,
    title: "接入平台数",
    type: "system.stats",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: { metric: "sync_completeness", unit: "percent", value: 100 },
    enabled: true,
    id: widgetIds.sync,
    schemaVersion: 1,
    stale: false,
    title: "数据同步",
    type: "system.stats",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: { metric: "records_collected", unit: "records", value: 128_893 },
    enabled: true,
    id: widgetIds.records,
    schemaVersion: 1,
    stale: false,
    title: "收集数据量",
    type: "system.stats",
    updatedAt: fixtureUpdatedAt
  },
  {
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
    },
    enabled: true,
    id: widgetIds.netease,
    schemaVersion: 1,
    stale: false,
    title: "网易云音乐",
    type: "music.netease.overview",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: {
      handle: "@nivalis",
      repositories: 86,
      stars: 1_248,
      followers: 133,
      contributions: 2_860
    },
    enabled: true,
    id: widgetIds.github,
    schemaVersion: 1,
    stale: false,
    title: "GitHub",
    type: "github.profile",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: { level: 6, following: 86, followers: 1_293, views: 67_700, likes: 2_341 },
    enabled: true,
    id: widgetIds.bilibili,
    schemaVersion: 1,
    stale: false,
    title: "Bilibili",
    type: "bilibili.profile",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: {
      level: 32,
      games: 126,
      playtimeHours: 1_456,
      achievements: 3_314,
      screenshots: 3_214
    },
    enabled: true,
    id: widgetIds.steam,
    schemaVersion: 1,
    stale: false,
    title: "Steam",
    type: "steam.profile",
    updatedAt: fixtureUpdatedAt
  },
  {
    dataConfig: {},
    data: { level: 5, entries: 2_341, watched: 12, watching: 389, reviews: 7 },
    enabled: true,
    id: widgetIds.bangumi,
    schemaVersion: 1,
    stale: false,
    title: "Bangumi",
    type: "bangumi.collection",
    updatedAt: fixtureUpdatedAt
  }
];

export const phaseTwoLegacyWidgetTemplates = phaseWidgetTemplates;

const unavailable = { availability: "unavailable" as const, reason: "not_synced" as const };

export const phaseTwoWidgets = phaseWidgetTemplates.map((widget) =>
  widget.type === "music.netease.overview"
    ? {
        ...widget,
        data: {
          account: {
            availability: "available",
            displayName: "Sanitized Fixture",
            providerUserId: "10001"
          },
          listeningDuration: unavailable,
          provider: "netease",
          recentListening: unavailable,
          totalListenCount: {
            availability: "available",
            provenance: "provider_reported",
            unit: "plays",
            value: 6_421
          },
          trend: unavailable,
          weeklyListening: unavailable
        },
        dataConfig: { range: "7d" },
        presentationConfig: { showArtists: true, showTrend: true },
        provider: "netease" as const,
        schemaVersion: 2,
        stale: true
      }
    : {
        ...widget,
        presentationConfig: {},
        provider: "fixture" as const
      }
) as readonly WidgetProjection[];

export const phaseTwoLayout: ResponsiveLayout = {
  lg: [
    { i: widgetIds.profile, x: 0, y: 0, w: 7, h: 3 },
    { i: widgetIds.uptime, x: 0, y: 3, w: 3, h: 2 },
    { i: widgetIds.providers, x: 3, y: 3, w: 3, h: 2 },
    { i: widgetIds.sync, x: 6, y: 3, w: 3, h: 2 },
    { i: widgetIds.records, x: 9, y: 3, w: 3, h: 2 },
    { i: widgetIds.netease, x: 0, y: 5, w: 8, h: 6 },
    { i: widgetIds.github, x: 8, y: 5, w: 4, h: 3 },
    { i: widgetIds.bilibili, x: 8, y: 8, w: 4, h: 3 },
    { i: widgetIds.steam, x: 0, y: 11, w: 6, h: 3 },
    { i: widgetIds.bangumi, x: 6, y: 11, w: 6, h: 3 }
  ],
  md: [
    { i: widgetIds.profile, x: 0, y: 0, w: 5, h: 3 },
    { i: widgetIds.uptime, x: 0, y: 3, w: 2, h: 2 },
    { i: widgetIds.providers, x: 2, y: 3, w: 2, h: 2 },
    { i: widgetIds.sync, x: 4, y: 3, w: 2, h: 2 },
    { i: widgetIds.records, x: 6, y: 3, w: 2, h: 2 },
    { i: widgetIds.netease, x: 0, y: 5, w: 5, h: 6 },
    { i: widgetIds.github, x: 5, y: 5, w: 3, h: 3 },
    { i: widgetIds.bilibili, x: 5, y: 8, w: 3, h: 3 },
    { i: widgetIds.steam, x: 0, y: 11, w: 4, h: 3 },
    { i: widgetIds.bangumi, x: 4, y: 11, w: 4, h: 3 }
  ],
  sm: [
    { i: widgetIds.profile, x: 0, y: 0, w: 4, h: 4 },
    { i: widgetIds.uptime, x: 0, y: 4, w: 2, h: 2 },
    { i: widgetIds.providers, x: 2, y: 4, w: 2, h: 2 },
    { i: widgetIds.sync, x: 0, y: 6, w: 2, h: 2 },
    { i: widgetIds.records, x: 2, y: 6, w: 2, h: 2 },
    { i: widgetIds.netease, x: 0, y: 8, w: 4, h: 12 },
    { i: widgetIds.github, x: 0, y: 20, w: 4, h: 4 },
    { i: widgetIds.bilibili, x: 0, y: 24, w: 4, h: 4 },
    { i: widgetIds.steam, x: 0, y: 28, w: 4, h: 4 },
    { i: widgetIds.bangumi, x: 0, y: 32, w: 4, h: 4 }
  ]
};

export const phaseTwoDraft: DashboardDraftInput = {
  layout: phaseTwoLayout,
  widgets: phaseTwoWidgets
};
