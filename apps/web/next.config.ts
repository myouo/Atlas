import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@nivalis/api-client"]
};

export default nextConfig;
