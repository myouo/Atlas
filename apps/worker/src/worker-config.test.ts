import { describe, expect, it } from "vitest";

import { loadWorkerConfig } from "./worker-config";

describe("Worker environment validation", () => {
  it("loads safe test defaults without credentials", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgresql://localhost/nivalis_test",
      NODE_ENV: "test"
    });
    expect(config).toMatchObject({
      fixtureProviderEnabled: true,
      fixtureScenario: "success",
      neteaseHttpFixtureEnabled: false,
      syncMaxAttempts: 3,
      syncQueueSchema: "pgboss"
    });
  });

  it("rejects the sanitized NetEase HTTP fixture in production", () => {
    expect(() =>
      loadWorkerConfig({
        DATABASE_URL: "postgresql://localhost/nivalis",
        NETEASE_HTTP_FIXTURE_ENABLED: "true",
        NODE_ENV: "production"
      })
    ).toThrow(/cannot be true in production/i);
  });

  it("rejects Fixture Provider in production", () => {
    expect(() =>
      loadWorkerConfig({
        DATABASE_URL: "postgresql://localhost/nivalis",
        FIXTURE_PROVIDER_ENABLED: "true",
        NODE_ENV: "production"
      })
    ).toThrow(/cannot be true in production/i);
  });

  it("rejects invalid retry and queue configuration", () => {
    expect(() =>
      loadWorkerConfig({
        DATABASE_URL: "postgresql://localhost/nivalis_test",
        NODE_ENV: "test",
        SYNC_QUEUE_SCHEMA: "unsafe-schema"
      })
    ).toThrow(/queue_schema/i);
    expect(() =>
      loadWorkerConfig({
        DATABASE_URL: "postgresql://localhost/nivalis_test",
        NODE_ENV: "test",
        SYNC_RETRY_BASE_DELAY_SECONDS: "10",
        SYNC_RETRY_MAX_DELAY_SECONDS: "2"
      })
    ).toThrow(/must not be less/i);
  });
});
