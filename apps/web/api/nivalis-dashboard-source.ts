import { createNivalisClient } from "@nivalis/api-client";
import type { DashboardDataSource } from "./dashboard-source";

/**
 * Phase 2 adapter. It is deliberately not selected by the Phase 1 runtime.
 * The only remote dependency is the Nivalis OpenAPI client.
 */
export function createApiDashboardSource(baseUrl: string): DashboardDataSource {
  const client = createNivalisClient(baseUrl);

  return {
    async getPublicAboutDashboard() {
      const { data, error } = await client.GET("/v1/public/dashboards/about");
      if (error || !data) {
        throw new Error("The Nivalis Dashboard snapshot could not be loaded.");
      }
      return data;
    }
  };
}
