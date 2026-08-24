import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface OpenApiDocument {
  readonly openapi: string;
  readonly paths: Record<string, Record<string, unknown>>;
  readonly components: {
    readonly headers: Record<string, unknown>;
    readonly parameters: Record<string, unknown>;
    readonly schemas: Record<string, unknown>;
    readonly securitySchemes: Record<string, unknown>;
  };
}

const document = parse(readFileSync("openapi/nivalis.openapi.yaml", "utf8")) as OpenApiDocument;

describe("Nivalis OpenAPI contract", () => {
  it("uses OpenAPI 3.1 and exposes the required versioned resources", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/ready",
        "/v1/public/profile",
        "/v1/public/dashboards/about",
        "/v1/auth/github/start",
        "/v1/auth/github/callback",
        "/v1/auth/session",
        "/v1/auth/logout",
        "/v1/me/dashboards/about/draft",
        "/v1/me/dashboards/about/data",
        "/v1/me/dashboards/about/publish",
        "/v1/me/dashboards/about/widgets",
        "/v1/me/dashboards/about/revisions",
        "/v1/me/dashboards/about/revisions/{revisionId}",
        "/v1/me/dashboards/about/revisions/{revisionId}/restore",
        "/v1/me/providers/{provider}/sync",
        "/v1/me/providers",
        "/v1/me/providers/netease",
        "/v1/me/providers/netease/connect",
        "/v1/me/providers/netease/connection",
        "/v1/me/providers/netease/auth-attempts/qr",
        "/v1/me/providers/netease/auth-attempts/sms",
        "/v1/me/providers/netease/auth-attempts/{attemptId}",
        "/v1/me/providers/netease/auth-attempts/{attemptId}/verify",
        "/v1/me/sync-jobs/{jobId}"
      ])
    );
  });

  it("documents one cookie session boundary and a write-only Provider credential", () => {
    expect(document.components.securitySchemes).toHaveProperty("NivalisSession");
    const credential = document.components.schemas.NeteaseConnectInput as {
      properties?: Record<string, { writeOnly?: boolean }>;
      required?: string[];
    };
    expect(credential.required).toContain("credential");
    expect(credential.properties?.credential?.writeOnly).toBe(true);
    expect(JSON.stringify(document.components.schemas.ProviderConnection)).not.toContain("musicU");
    const sms = document.components.schemas.NeteaseSmsAuthInput as {
      properties?: Record<string, { writeOnly?: boolean }>;
    };
    const verify = document.components.schemas.NeteaseSmsVerifyInput as {
      properties?: Record<string, { writeOnly?: boolean }>;
    };
    expect(sms.properties?.phone?.writeOnly).toBe(true);
    expect(verify.properties?.code?.writeOnly).toBe(true);
    expect(JSON.stringify(document.components.schemas.ProviderAuthAttempt)).not.toMatch(
      /credential|cookie|phoneNumber|codeValue/i
    );
  });

  it("documents 401 and 403 on every Owner operation", () => {
    for (const [path, item] of Object.entries(document.paths)) {
      if (!path.startsWith("/v1/me/")) continue;
      for (const [method, operation] of Object.entries(item)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const responses = (operation as { responses?: Record<string, unknown> }).responses;
        expect(responses, `${method.toUpperCase()} ${path}`).toHaveProperty("401");
        expect(responses, `${method.toUpperCase()} ${path}`).toHaveProperty("403");
      }
    }
  });

  it("keys projections by dataConfig while keeping presentationConfig in revision state", () => {
    const widget = document.components.schemas.WidgetConfiguration as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(widget.required).toEqual(
      expect.arrayContaining(["provider", "dataConfig", "presentationConfig"])
    );
    expect(widget.properties).not.toHaveProperty("config");
  });

  it("documents asynchronous SyncRun resources without exposing pg-boss identifiers", () => {
    const syncPost = document.paths["/v1/me/providers/{provider}/sync"]?.post as {
      responses?: Record<string, unknown>;
    };
    expect(syncPost.responses).toHaveProperty("202");
    expect(syncPost.responses).not.toHaveProperty("501");
    expect(syncPost.responses).not.toHaveProperty("200");
    expect(document.components.schemas).toHaveProperty("SyncJob");
    expect(JSON.stringify(document.components.schemas.SyncJob)).not.toContain("queueJobId");
  });

  it("separates revision configuration ETags from live data and public view ETags", () => {
    expect(document.components.headers).toHaveProperty("RevisionETag");
    expect(document.components.headers).toHaveProperty("DataETag");
    expect(document.components.headers).toHaveProperty("ViewETag");
    const draft = JSON.stringify({
      base: document.components.schemas.DashboardConfigurationBase,
      state: document.components.schemas.DashboardState
    });
    const live = JSON.stringify(document.components.schemas.DashboardLiveData);
    expect(draft).toContain("WidgetConfiguration");
    expect(draft).not.toContain("WidgetProjection");
    expect(live).toContain("WidgetProjection");
  });

  it("documents strong ETag and If-Match concurrency on every Draft mutation", () => {
    expect(document.components.parameters).toHaveProperty("IfMatch");
    expect(document.components.headers).toHaveProperty("RevisionETag");
    const mutations = [
      ["/v1/me/dashboards/about/draft", "put"],
      ["/v1/me/dashboards/about/publish", "post"],
      ["/v1/me/dashboards/about/widgets", "post"],
      ["/v1/me/widgets/{widgetId}", "patch"],
      ["/v1/me/widgets/{widgetId}", "delete"],
      ["/v1/me/dashboards/about/revisions/{revisionId}/restore", "post"]
    ] as const;
    for (const [path, method] of mutations) {
      const operation = document.paths[path]?.[method] as {
        parameters?: Array<{ $ref?: string }>;
        responses?: Record<string, unknown>;
      };
      expect(operation.parameters).toContainEqual({ $ref: "#/components/parameters/IfMatch" });
      expect(operation.responses).toHaveProperty("412");
      expect(operation.responses).toHaveProperty("428");
    }
    const draftGet = document.paths["/v1/me/dashboards/about/draft"]?.get as {
      responses?: Record<string, { headers?: Record<string, unknown> }>;
    };
    expect(draftGet.responses?.["200"]?.headers).toHaveProperty("ETag");
  });

  it("saves the complete current Draft state atomically", () => {
    const draftUpdate = document.components.schemas.DashboardDraftUpdate as {
      required?: string[];
    };
    expect(draftUpdate.required).toEqual(expect.arrayContaining(["layout", "widgets"]));
  });

  it("exposes immutable revision metadata, detail, and restore provenance", () => {
    expect(document.components.schemas).toHaveProperty("DashboardRevisionMetadata");
    expect(document.components.schemas).toHaveProperty("DashboardRevisionList");
    expect(document.components.schemas).toHaveProperty("DashboardRevisionDetail");
    expect(document.components.schemas).toHaveProperty("RevisionConflictProblem");
    const state = document.components.schemas.DashboardState as {
      allOf?: Array<{ properties?: Record<string, unknown>; required?: string[] }>;
    };
    expect(state.allOf?.[1]?.required).toContain("revisionId");
  });

  it("keeps UI styling out of backend schemas", () => {
    const schemas = JSON.stringify(document.components.schemas);
    for (const forbidden of [
      "borderRadius",
      "tailwindClass",
      "fontSize",
      "backdropBlur",
      "boxShadow"
    ]) {
      expect(schemas).not.toContain(forbidden);
    }
  });

  it("defines RFC 9457 Problem Details", () => {
    expect(document.components.schemas).toHaveProperty("ProblemDetails");
    const defaultResponse = document.paths["/v1/public/profile"]?.get as {
      responses?: Record<string, { $ref?: string }>;
    };
    expect(defaultResponse.responses?.default?.$ref).toBe("#/components/responses/Problem");
  });
});
