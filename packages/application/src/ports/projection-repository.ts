import type {
  Profile,
  ProviderConnection,
  ProjectionTarget,
  StoredWidgetProjection,
  WidgetConfiguration,
  WidgetProjection,
  WidgetProjectionVersion
} from "@nivalis/domain";

export interface HydratedWidgetSet {
  readonly generatedAt: Date;
  readonly versions: readonly WidgetProjectionVersion[];
  readonly widgets: readonly WidgetProjection[];
}

export interface ProjectionRepository {
  hydrateWidgets(
    configurations: readonly WidgetConfiguration[],
    profile: Profile,
    fallbackAt: Date
  ): Promise<HydratedWidgetSet>;
  listActiveTargets(connection: ProviderConnection): Promise<readonly ProjectionTarget[]>;
  getStoredProjections(
    targets: readonly ProjectionTarget[]
  ): Promise<readonly StoredWidgetProjection[]>;
}

export interface ViewVersionFactory {
  createDataVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]): string;
  createViewVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]): string;
}
