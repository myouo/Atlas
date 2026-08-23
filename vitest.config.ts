import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    coverage: {
      reporter: ["text", "json", "html"]
    },
    environment: "jsdom",
    include: ["apps/**/*.test.{ts,tsx}", "openapi/**/*.test.ts", "packages/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"]
  }
});
