import createClient from "openapi-fetch";

import type { components, paths } from "./generated/schema";

export type DashboardReadModel = components["schemas"]["DashboardReadModel"];
export type AuthSession = components["schemas"]["AuthSession"];
export type DashboardState = components["schemas"]["DashboardState"];
export type DashboardLiveData = components["schemas"]["DashboardLiveData"];
export type DashboardDraftUpdate = components["schemas"]["DashboardDraftUpdate"];
export type DashboardRevisionDetail = components["schemas"]["DashboardRevisionDetail"];
export type DashboardRevisionList = components["schemas"]["DashboardRevisionList"];
export type DashboardRevisionMetadata = components["schemas"]["DashboardRevisionMetadata"];
export type Profile = components["schemas"]["Profile"];
export type Provider = components["schemas"]["Provider"];
export type ProviderStatus = components["schemas"]["ProviderStatus"];
export type ProviderConnection = components["schemas"]["ProviderConnection"];
export type ProviderConnectAccepted = components["schemas"]["ProviderConnectAccepted"];
export type ProviderAuthAttempt = components["schemas"]["ProviderAuthAttempt"];
export type SyncJob = components["schemas"]["SyncJob"];
export type ResponsiveLayout = components["schemas"]["ResponsiveLayout"];
export type WidgetProjection = components["schemas"]["WidgetProjection"];
export type WidgetConfiguration = components["schemas"]["WidgetConfiguration"];
export type WidgetType = WidgetConfiguration["type"];

export function createNivalisClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, credentials: "include" });
}

export type { components, paths };
