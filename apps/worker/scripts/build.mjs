import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const workerRoot = fileURLToPath(new URL("../", import.meta.url));
const outdir = path.join(workerRoot, "dist");

if (path.dirname(outdir) !== path.resolve(workerRoot) || path.basename(outdir) !== "dist") {
  throw new Error("Refusing to clean an unexpected Worker build directory.");
}

await rm(outdir, { force: true, recursive: true });

await build({
  absWorkingDir: workerRoot,
  bundle: true,
  entryNames: "[dir]/[name]",
  entryPoints: { "provider-replay": "src/cli/provider-replay.ts", start: "src/start.ts" },
  external: ["dotenv", "kysely", "kysely/*", "pg", "pg-boss", "pino"],
  format: "esm",
  outdir,
  platform: "node",
  sourcemap: true,
  target: "node24"
});
