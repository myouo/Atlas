import type { DashboardReadModel, WidgetProjection } from "@nivalis/api-client";

export const dashboardFixture: DashboardReadModel = {
  dashboardId: "about",
  layout: { lg: [], md: [], sm: [] },
  profile: {
    avatarUrl: "/images/avatar.webp",
    bio: "Build & share <things>",
    displayName: "Nivalis",
    handle: "@nivalis",
    headline: "Developer",
    tags: ["Coding", "Music"]
  },
  revision: 1,
  widgets: [
    {
      data: { metric: "records_collected", unit: "records", value: 297 },
      dataConfig: {},
      enabled: true,
      id: "first-card",
      presentationConfig: {},
      provider: "fixture",
      schemaVersion: 1,
      stale: false,
      title: "Future & <Card>",
      type: "system.stats",
      updatedAt: "2026-09-25T00:00:00.000Z"
    } as WidgetProjection,
    {
      data: { metric: "records_collected", unit: "records", value: 0 },
      dataConfig: {},
      enabled: false,
      id: "disabled-card",
      presentationConfig: {},
      provider: "fixture",
      schemaVersion: 1,
      stale: false,
      title: "Hidden card",
      type: "system.stats",
      updatedAt: "2026-09-25T00:00:00.000Z"
    } as WidgetProjection
  ]
};
