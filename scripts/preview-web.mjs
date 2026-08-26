import { spawn } from "node:child_process";
import { createConnection } from "node:net";
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

const [webOccupied, apiOccupied] = await Promise.all([
  portIsOccupied(host, configuredPort),
  portIsOccupied(host, apiPort)
]);
if (webOccupied || apiOccupied) {
  if (webOccupied && apiOccupied && (await existingPreviewIsHealthy())) {
    console.log(`Nivalis local preview is already running at http://${host}:${configuredPort}`);
    console.log(
      "Reuse that browser tab, or stop its original terminal with Ctrl+C before restart."
    );
    process.exit(0);
  }
  console.error(
    `Cannot start Nivalis preview: ${[
      webOccupied ? `frontend port ${configuredPort}` : null,
      apiOccupied ? `API port ${apiPort}` : null
    ]
      .filter(Boolean)
      .join(" and ")} ${webOccupied && apiOccupied ? "are" : "is"} already in use.`
  );
  console.error(
    "Stop the process using that port, or set NIVALIS_PREVIEW_PORT and NIVALIS_PREVIEW_API_PORT to another pair."
  );
  process.exit(1);
}

console.log("Starting the complete Nivalis frontend with a loopback-only Preview API.");
console.log("NetEase uses the real local Cookie pipeline; unconnected platforms remain fixtures.");
console.log(`Preview: http://${host}:${configuredPort}`);

const childEnvironment = {
  ...process.env,
  NIVALIS_PREVIEW_API_PORT: String(apiPort),
  NIVALIS_PREVIEW_WEB_PORT: String(configuredPort)
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

function portIsOccupied(address, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: address, port });
    let settled = false;
    const finish = (occupied) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function existingPreviewIsHealthy() {
  try {
    const [apiResponse, webResponse] = await Promise.all([
      fetch(`http://${host}:${apiPort}/health`, { signal: AbortSignal.timeout(1_500) }),
      fetch(`http://${host}:${configuredPort}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(1_500)
      })
    ]);
    if (!apiResponse.ok || !webResponse.ok) return false;
    const health = await apiResponse.json();
    return health?.mode === "local-preview" && health?.status === "ok";
  } catch {
    return false;
  }
}
