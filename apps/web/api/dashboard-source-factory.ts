import type { DashboardDataSource, DashboardSourceKind } from "./dashboard-source";
import { mockDashboardSource } from "./mock-dashboard-source";
import { createApiDashboardSource } from "./nivalis-dashboard-source";

interface DashboardSourceConfig {
  readonly apiBaseUrl?: string;
  readonly kind: DashboardSourceKind;
}

export function createDashboardDataSource(config: DashboardSourceConfig): DashboardDataSource {
  return config.kind === "api"
    ? createApiDashboardSource(config.apiBaseUrl ?? "")
    : mockDashboardSource;
}

const configuredKind = process.env.NEXT_PUBLIC_DASHBOARD_SOURCE === "api" ? "api" : "mock";

export const dashboardSource = createDashboardDataSource({
  ...(process.env.NEXT_PUBLIC_API_BASE_URL
    ? { apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL }
    : {}),
  kind: configuredKind
});
