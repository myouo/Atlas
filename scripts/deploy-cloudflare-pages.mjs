import { spawn } from "node:child_process";
import process from "node:process";

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT?.trim();
const branch = process.env.CLOUDFLARE_PAGES_BRANCH?.trim() || "master";
const dashboardSource = process.env.NEXT_PUBLIC_DASHBOARD_SOURCE?.trim();
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

if (!projectName) {
  console.error("CLOUDFLARE_PAGES_PROJECT is required.");
  process.exit(1);
}

if (dashboardSource !== "api" || apiBaseUrl !== "/api") {
  console.error(
    "Pages deployment requires NEXT_PUBLIC_DASHBOARD_SOURCE=api and NEXT_PUBLIC_API_BASE_URL=/api so OAuth sessions stay on the Pages origin. Use build:pages:mock only for an explicit local Mock artifact."
  );
  process.exit(1);
}

await run("pnpm", ["build:pages"]);
await run(
  "pnpm",
  ["exec", "wrangler", "pages", "deploy", "out", "--project-name", projectName, "--branch", branch],
  { cwd: "apps/web" }
);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${String(code)}.`));
    });
  });
}
