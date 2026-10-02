import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DashboardReadModel } from "@nivalis/api-client";
import { captureNativeVariants } from "../src/native-svg-capture";
import {
  NATIVE_CAPTURE_VERSION,
  nativeSceneContentHash,
  nativeSceneScopeHash
} from "../src/native-scene-cache";
import type { PublishedScene } from "../src/native-svg-service";

const site = process.env.SVG_SITE_URL ?? "https://aboutme.nivalis.is";
const endpoint = process.env.SVG_PUBLISH_URL ?? "https://svg.aboutme.nivalis.is/internal/scenes";
const token = process.env.SVG_PUBLISH_TOKEN;
const output = process.env.SVG_OUTPUT_DIR;
if (!token && !output) throw new Error("Set SVG_PUBLISH_TOKEN or SVG_OUTPUT_DIR");
const headers = { Authorization: `Bearer ${token ?? ""}` };
const library = await readFile(
  fileURLToPath(new URL("../../../../../dist/svg-browser/capture.js", import.meta.url)),
  "utf8"
);
const response = await fetch(new URL("/api/v1/public/dashboards/about", site), {
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Public dashboard HTTP ${response.status}`);
const dashboard = (await response.json()) as DashboardReadModel;
const [contentHash, scopeHash] = await Promise.all([
  nativeSceneContentHash(dashboard),
  nativeSceneScopeHash(dashboard)
]);
let ready: { range: string; period: string; style: string; theme: string; ready: boolean }[] = [];
if (token && !process.env.SVG_FORCE_CAPTURE) {
  const status = await fetch(endpoint, { headers, signal: AbortSignal.timeout(60_000) });
  if (!status.ok) throw new Error(`SVG publication status HTTP ${status.status}`);
  const current = (await status.json()) as { contentHash: string; variants: typeof ready };
  if (current.contentHash === contentHash) ready = current.variants;
  if (ready.length === 16 && ready.every((variant) => variant.ready)) {
    console.log("All public SVG variants already match the current dashboard.");
    process.exit(0);
  }
}
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--disable-gpu"],
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {})
});
try {
  for (const range of ["week", "all_time"] as const)
    for (const period of ["month", "week"] as const) {
      if (
        ready.filter(
          (variant) => variant.range === range && variant.period === period && variant.ready
        ).length === 4
      )
        continue;
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 1
      });
      try {
        const capturedAt = new Date().toISOString();
        const variants = await captureNativeVariants(dashboard, page, site, library, range, period);
        for (const variant of variants) {
          const { scene, ...options } = variant;
          const published: PublishedScene = {
            version: NATIVE_CAPTURE_VERSION,
            contentHash,
            scopeHash,
            capturedAt,
            options,
            scene
          };
          if (output)
            await writeFile(
              `${output}/${range}-${period}-${options.style}-${options.theme}.json`,
              JSON.stringify(published)
            );
          if (token) {
            const body = JSON.stringify(published);
            let uploaded = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              const upload = await fetch(endpoint, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body,
                signal: AbortSignal.timeout(60_000)
              });
              if (upload.ok) {
                uploaded = true;
                break;
              }
              if (upload.status < 500 && upload.status !== 429)
                throw new Error(`SVG publication HTTP ${upload.status}`);
              console.log(`Retrying SVG publication after HTTP ${upload.status}`);
              const retryAfter = Math.min(
                30,
                Math.max(2, Number(upload.headers.get("Retry-After")) || 2)
              );
              await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            }
            if (!uploaded) throw new Error("SVG publication unavailable after three attempts");
          }
          console.log(`Published native SVG: ${range}/${period}/${options.style}/${options.theme}`);
        }
      } finally {
        await page.close();
      }
    }
} finally {
  await browser.close();
}
