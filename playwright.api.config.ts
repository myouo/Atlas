import { defineConfig, devices } from "@playwright/test";

for (const key of ["NO_PROXY", "no_proxy"] as const) {
  const current = process.env[key];
  process.env[key] = [current, "127.0.0.1", "localhost"].filter(Boolean).join(",");
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-api" }]],
  testDir: "./apps/web/e2e",
  testMatch: "**/*.api.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4174",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @nivalis/api dev",
      env: {
        API_PORT: "3002",
        CORS_ORIGINS: "http://127.0.0.1:4174",
        DATABASE_URL: testDatabaseUrl,
        FIXTURE_PROVIDER_ENABLED: "true",
        LOG_LEVEL: "silent",
        NODE_ENV: "test"
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: "http://127.0.0.1:3002/ready"
    },
    {
      command: "pnpm --filter @nivalis/worker dev",
      env: {
        DATABASE_URL: testDatabaseUrl,
        FIXTURE_PROVIDER_ENABLED: "true",
        FIXTURE_PROVIDER_SCENARIO: "success",
        LOG_LEVEL: "silent",
        NETEASE_HTTP_FIXTURE_ENABLED: "true",
        NETEASE_HTTP_FIXTURE_SCENARIO: "normal",
        NODE_ENV: "test",
        PROVIDER_AUTH_QR_POLL_SECONDS: "1",
        SYNC_POLL_INTERVAL_SECONDS: "0.5"
      },
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: "pnpm --filter @nivalis/web dev --hostname 127.0.0.1 --port 4174",
      env: {
        NEXT_DIST_DIR: ".next-e2e-api",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3002",
        NEXT_PUBLIC_DASHBOARD_SOURCE: "api"
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: "http://127.0.0.1:4174"
    }
  ],
  projects: [{ name: "api-desktop-chromium", use: { ...devices["Desktop Chrome"] } }]
});
