import type { DashboardReadModel } from "@nivalis/api-client";

export interface DashboardDataSource {
  getPublicAboutDashboard(): Promise<DashboardReadModel>;
}
