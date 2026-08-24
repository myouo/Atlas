import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

loadEnvConfig(fileURLToPath(new URL("../../", import.meta.url)));

const isCloudflarePagesExport = process.env.NIVALIS_WEB_DEPLOY_TARGET === "cloudflare-pages";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    useTypeScriptCli: false
  },
  ...(isCloudflarePagesExport
    ? { images: { unoptimized: true }, output: "export" as const }
    : { output: "standalone" as const }),
  reactStrictMode: true,
  transpilePackages: ["@nivalis/api-client"]
};

export default nextConfig;
