import { spawn } from "node:child_process";
import process from "node:process";

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT?.trim();
const branch = process.env.CLOUDFLARE_PAGES_BRANCH?.trim() || "master";

if (!projectName) {
  console.error("CLOUDFLARE_PAGES_PROJECT is required.");
  process.exit(1);
}

await run("pnpm", ["build:pages"]);
await run("pnpm", [
  "exec",
  "wrangler",
  "pages",
  "deploy",
  "apps/web/out",
  "--project-name",
  projectName,
  "--branch",
  branch
]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${String(code)}.`));
    });
  });
}
