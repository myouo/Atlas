import { defineConfig, devices } from "@playwright/test";

for (const key of ["NO_PROXY", "no_proxy"] as const) {
  const current = process.env[key];
  process.env[key] = [current, "127.0.0.1", "localhost"].filter(Boolean).join(",");
}

export default defineConfig({
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  testDir: "./apps/web/e2e",
  testIgnore: "**/*.api.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm --filter @nivalis/web dev --hostname 127.0.0.1 --port 4173",
    env: { NEXT_DIST_DIR: ".next-e2e-mock" },
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:4173"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ]
});
