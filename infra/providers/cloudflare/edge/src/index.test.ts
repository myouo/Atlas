import { describe, expect, it } from "vitest";

import worker from "./index";
import type { Environment } from "./index";

describe("Cloudflare edge gateway", () => {
  it("reports edge process health without claiming API readiness", async () => {
    const environment = {} as Environment;
    const health = await worker.fetch(
      new Request("https://edge.invalid/health"),
      environment,
      executionContext
    );
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "ok" });

    const ready = await worker.fetch(
      new Request("https://edge.invalid/ready"),
      environment,
      executionContext
    );
    expect(ready.status).toBe(503);
    expect(ready.headers.get("content-type")).toContain("application/problem+json");
    await expect(ready.json()).resolves.toMatchObject({
      status: 503,
      type: "urn:nivalis:problem:database-unavailable"
    });
  });

  it("returns an anonymous session without touching D1", async () => {
    const response = await worker.fetch(
      new Request("https://edge.invalid/v1/auth/session"),
      {} as Environment,
      executionContext
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      actorId: null,
      authenticated: false,
      expiresAt: null,
      role: null
    });
  });

  it("never enables wildcard CORS", async () => {
    const denied = await worker.fetch(
      new Request("https://edge.invalid/v1/public/dashboards/about", {
        headers: { Origin: "https://untrusted.invalid" },
        method: "OPTIONS"
      }),
      { CORS_ORIGINS: "https://trusted.invalid" } as Environment,
      executionContext
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.has("access-control-allow-origin")).toBe(false);

    const allowed = await worker.fetch(
      new Request("https://edge.invalid/v1/public/dashboards/about", {
        headers: { Origin: "https://trusted.invalid" },
        method: "OPTIONS"
      }),
      { CORS_ORIGINS: "https://trusted.invalid" } as Environment,
      executionContext
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://trusted.invalid");
  });
});

const executionContext = {} as ExecutionContext;
