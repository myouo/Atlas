import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface OpenApiDocument {
  readonly openapi: string;
  readonly paths: Record<string, Record<string, unknown>>;
  readonly components: {
    readonly schemas: Record<string, unknown>;
  };
}

const document = parse(readFileSync("openapi/nivalis.openapi.yaml", "utf8")) as OpenApiDocument;

describe("Nivalis OpenAPI contract", () => {
  it("uses OpenAPI 3.1 and exposes the required versioned resources", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/v1/public/profile",
        "/v1/public/dashboards/about",
        "/v1/me/dashboards/about/draft",
        "/v1/me/dashboards/about/publish",
        "/v1/me/dashboards/about/widgets",
        "/v1/me/providers/{provider}/sync",
        "/v1/me/sync-jobs/{jobId}"
      ])
    );
  });

  it("models synchronization as an asynchronous 202 job resource", () => {
    const syncPost = document.paths["/v1/me/providers/{provider}/sync"]?.post as {
      responses?: Record<string, unknown>;
    };
    expect(syncPost.responses).toHaveProperty("202");
    expect(syncPost.responses).not.toHaveProperty("200");
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
