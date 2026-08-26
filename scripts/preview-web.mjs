import { spawn } from "node:child_process";
import process from "node:process";

const host = "127.0.0.1";
const configuredPort = Number(process.env.NIVALIS_PREVIEW_PORT ?? "3000");

if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
  console.error("NIVALIS_PREVIEW_PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

console.log("Starting the complete Nivalis frontend in explicit Mock Mode.");
console.log("No API, database, Worker, Queue, or Provider credential will be used.");
console.log(`Preview: http://${host}:${configuredPort}`);

const child = spawn(
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
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: "",
      NEXT_PUBLIC_DASHBOARD_SOURCE: "mock"
    },
    stdio: "inherit"
  }
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(`Frontend preview failed to start: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
