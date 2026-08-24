import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const apiRoot = fileURLToPath(new URL("../", import.meta.url));
const outdir = path.join(apiRoot, "dist");

if (path.dirname(outdir) !== path.resolve(apiRoot) || path.basename(outdir) !== "dist") {
  throw new Error("Refusing to clean an unexpected API build directory.");
}

await rm(outdir, { force: true, recursive: true });

await build({
  absWorkingDir: apiRoot,
  bundle: true,
  entryNames: "[dir]/[name]",
  entryPoints: {
    "cli/database": "src/cli/database.ts",
    start: "src/start.ts"
  },
  external: [
    "@fastify/cors",
    "dotenv",
    "fastify",
    "kysely",
    "kysely/*",
    "pg",
    "pg-boss",
    "pino",
    "typebox",
    "typebox/*"
  ],
  format: "esm",
  outdir,
  platform: "node",
  sourcemap: true,
  target: "node24"
});
