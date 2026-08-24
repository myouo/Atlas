import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    "**/.next/**",
    "**/.next-*/**",
    "**/.wrangler/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/out/**",
    "**/next-env.d.ts",
    "**/worker-configuration.d.ts",
    "**/playwright-report/**",
    "**/playwright-report-api/**",
    "**/test-results/**",
    "packages/api-client/src/generated/**",
    "Nivalis_AboutMe_Spec_GitHub_Pack_v0.1/**"
  ]),
  {
    settings: {
      react: {
        version: "19.2"
      }
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off"
    }
  },
  {
    files: ["packages/domain/**/*.ts", "packages/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "cloudflare:*",
                "@cloudflare/*",
                "@nivalis/connectors",
                "@nivalis/connectors/*",
                "fastify",
                "fastify/*",
                "kysely",
                "kysely/*",
                "next",
                "next/*",
                "pg"
              ],
              message:
                "Domain and application layers cannot depend on infrastructure or connector implementations."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["apps/api/src/transport/**/*.ts"],
    ignores: [
      "apps/api/src/transport/**/*.test.ts",
      "apps/api/src/transport/**/*.integration.test.ts"
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "kysely",
                "kysely/*",
                "pg",
                "../../infrastructure/*",
                "../../../infrastructure/*"
              ],
              message:
                "HTTP transport may call Application services but cannot access database adapters."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    settings: {
      next: {
        rootDir: "apps/web"
      }
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@nivalis/connectors",
                "@nivalis/connectors/*",
                "@nivalis/domain",
                "@nivalis/domain/*",
                "@nivalis/application",
                "@nivalis/application/*"
              ],
              message:
                "The Web app may consume only the generated API client across the backend boundary."
            }
          ]
        }
      ]
    }
  }
]);
