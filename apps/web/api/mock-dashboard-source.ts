import type { DashboardDataSource } from "./dashboard-source";
import { mockDashboard } from "../features/dashboard/mock-dashboard";

function cloneDashboard() {
  return structuredClone(mockDashboard);
}

export const mockDashboardSource: DashboardDataSource = {
  async getPublicAboutDashboard() {
    await Promise.resolve();
    return cloneDashboard();
  }
};
