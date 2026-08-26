import { spawn } from "node:child_process";
import process from "node:process";

const host = "127.0.0.1";
const configuredPort = Number(process.env.NIVALIS_PREVIEW_PORT ?? "3000");
const apiPort = Number(process.env.NIVALIS_PREVIEW_API_PORT ?? "4174");

if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
  console.error("NIVALIS_PREVIEW_PORT must be an integer between 1 and 65535.");
  process.exit(1);
}
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535) {
  console.error("NIVALIS_PREVIEW_API_PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

console.log("Starting the complete Nivalis frontend with a loopback-only Preview API.");
console.log("NetEase uses the real local Cookie pipeline; unconnected platforms remain fixtures.");
console.log(`Preview: http://${host}:${configuredPort}`);

const childEnvironment = {
  ...process.env,
  NIVALIS_PREVIEW_API_PORT: String(apiPort)
};
const api = spawn(process.execPath, ["--import", "tsx", "scripts/local-preview-api.ts"], {
  env: childEnvironment,
  stdio: "inherit"
});
const web = spawn(
  "pnpm",
  [
    "--filter",
    "@nivalis/web",
    "exec",
    "next",
    "dev",
    "--hostname",
    host,
    "--port",
    String(configuredPort)
  ],
  {
    env: {
      ...childEnvironment,
      NEXT_PUBLIC_API_BASE_URL: `http://${host}:${apiPort}`,
      NEXT_PUBLIC_DASHBOARD_SOURCE: "api"
    },
    stdio: "inherit"
  }
);

const children = [api, web];
let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal));
}

for (const child of children) {
  child.once("error", (error) => {
    console.error(`Frontend preview process failed to start: ${error.message}`);
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      process.exitCode = code ?? (signal ? 1 : 0);
      stop();
    }
  });
}
