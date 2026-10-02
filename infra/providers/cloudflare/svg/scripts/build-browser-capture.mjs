import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
await mkdir(`${root}dist/svg-browser`, { recursive: true });
await build({
  entryPoints: [`${root}infra/providers/cloudflare/svg/src/browser-capture.ts`],
  outfile: `${root}dist/svg-browser/capture.js`,
  bundle: true,
  format: "iife",
  globalName: "NivalisCapture",
  platform: "browser",
  target: "chrome120",
  minify: true,
  logLevel: "warning"
});
