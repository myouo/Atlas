import { ABOUT_DASHBOARD_SLUG, DashboardNotFoundError } from "@nivalis/domain";
import type {
  DashboardLiveDataSnapshot,
  DashboardReadModelSnapshot,
  OwnerContext
} from "@nivalis/domain";

import type { DashboardConfigurationReader } from "../ports/dashboard-repository";
import type { ViewVersionFactory, WidgetProjectionHydrator } from "../ports/projection-repository";

export class DashboardReadService {
  constructor(
    private readonly dashboards: DashboardConfigurationReader,
    private readonly projections: WidgetProjectionHydrator,
    private readonly versions: ViewVersionFactory
  ) {}

  async getPublishedDashboard(): Promise<DashboardReadModelSnapshot> {
    const configuration = await this.dashboards.getCurrentBySlug(ABOUT_DASHBOARD_SLUG, "published");
    if (!configuration) throw new DashboardNotFoundError(ABOUT_DASHBOARD_SLUG);
    const hydrated = await this.projections.hydrateWidgets(
      configuration.widgets,
      configuration.profile,
      configuration.updatedAt
    );
    return {
      dashboardId: configuration.dashboardId,
      layout: configuration.layout,
      profile: configuration.profile,
      revision: configuration.revision,
      revisionId: configuration.revisionId,
      updatedAt: configuration.updatedAt,
      viewVersion: await this.versions.createViewVersion(
        configuration.revisionId,
        hydrated.versions
      ),
      widgets: hydrated.widgets
    };
  }

  async getDraftLiveData(context: OwnerContext): Promise<DashboardLiveDataSnapshot> {
    const configuration = await this.dashboards.getCurrentForOwner(
      context.actorId,
      ABOUT_DASHBOARD_SLUG,
      "draft"
    );
    if (!configuration) throw new DashboardNotFoundError(ABOUT_DASHBOARD_SLUG);
    const hydrated = await this.projections.hydrateWidgets(
      configuration.widgets,
      configuration.profile,
      configuration.updatedAt
    );
    return {
      configurationRevisionId: configuration.revisionId,
      dashboardId: configuration.dashboardId,
      dataVersion: await this.versions.createDataVersion(
        configuration.revisionId,
        hydrated.versions
      ),
      generatedAt: hydrated.generatedAt,
      projectionVersions: hydrated.versions,
      widgets: hydrated.widgets
    };
  }
}
