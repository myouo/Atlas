import createClient from "openapi-fetch";

import type { components, paths } from "./generated/schema";

export type DashboardReadModel = components["schemas"]["DashboardReadModel"];
export type DashboardRevision = components["schemas"]["DashboardRevision"];
export type Profile = components["schemas"]["Profile"];
export type Provider = components["schemas"]["Provider"];
export type ResponsiveLayout = components["schemas"]["ResponsiveLayout"];
export type WidgetProjection = components["schemas"]["WidgetProjection"];
export type WidgetType = components["schemas"]["WidgetType"];

export function createNivalisClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export type { components, paths };
