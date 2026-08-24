import { describe, expect, it } from "vitest";

import { loadApiConfig } from "./api-config";

describe("API runtime configuration", () => {
  it("loads safe test defaults from explicit environment input", () => {
    const config = loadApiConfig({
      DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/nivalis_dev",
      NODE_ENV: "test"
    });
    expect(config.host).toBe("127.0.0.1");
    expect(config.authOauthFixtureEnabled).toBe(true);
    expect(config.fixtureProviderEnabled).toBe(true);
    expect(config.syncMaxAttempts).toBe(3);
    expect(config.corsOrigins).toEqual([]);
  });

  it("refuses the Fixture Provider in production", () => {
    expect(() =>
      loadApiConfig({
        DATABASE_URL: "postgresql://database.invalid/nivalis",
        FIXTURE_PROVIDER_ENABLED: "true",
        NODE_ENV: "production"
      })
    ).toThrow(/cannot be true in production/);
  });

  it("refuses the OAuth fixture in production", () => {
    expect(() =>
      loadApiConfig({
        DATABASE_URL: "postgresql://database.invalid/nivalis",
        NODE_ENV: "production",
        AUTH_OAUTH_FIXTURE_ENABLED: "true"
      })
    ).toThrow(/cannot be true in production/);
  });

  it("rejects malformed values at runtime", () => {
    expect(() =>
      loadApiConfig({
        API_PORT: "not-a-port",
        DATABASE_URL: "postgresql://database.invalid/nivalis",
        NODE_ENV: "test"
      })
    ).toThrow(/Invalid Nivalis API environment configuration/);
  });
});
