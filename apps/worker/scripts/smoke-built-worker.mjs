import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = fileURLToPath(new URL("../", import.meta.url));
const entrypoint = path.join(workerRoot, "dist", "start.js");
if (!existsSync(entrypoint)) throw new Error("Build the Worker before running its smoke test.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Worker smoke test.");

const child = spawn(process.execPath, [entrypoint], {
  cwd: workerRoot,
  env: {
    ...process.env,
    FIXTURE_PROVIDER_ENABLED: "true",
    LOG_LEVEL: "info",
    NODE_ENV: "test",
    SYNC_POLL_INTERVAL_SECONDS: "0.5"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
let ready = false;
const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  output += chunk;
  if (!ready && chunk.includes("Nivalis Worker ready")) {
    ready = true;
    child.kill("SIGTERM");
  }
});
child.stderr.on("data", (chunk) => {
  output += chunk;
});

const exitCode = await new Promise((resolve) => child.once("exit", resolve));
clearTimeout(timeout);
if (!ready || exitCode !== 0) {
  throw new Error(
    `Compiled Worker smoke failed (exit ${String(exitCode)}): ${output.slice(-2_000)}`
  );
}
process.stdout.write('{"command":"smoke-built-worker","status":"passed"}\n');
