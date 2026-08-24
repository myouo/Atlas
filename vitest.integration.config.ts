import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["apps/api/**/*.integration.test.ts", "apps/worker/**/*.integration.test.ts"],
    testTimeout: 45_000
  }
});
