import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.API_SMOKE_PORT ?? "3103");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the compiled API smoke test.");
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("API_SMOKE_PORT must be a valid TCP port.");
}

const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["dist/start.js"], {
  cwd: apiRoot,
  env: {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(port),
    LOG_LEVEL: "silent",
    NODE_ENV: "test"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let diagnostics = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    diagnostics = `${diagnostics}${String(chunk)}`.slice(-4_000);
  });
}

try {
  await waitUntilReady();
  const response = await fetch(`${baseUrl}/v1/public/dashboards/about`);
  if (!response.ok) throw new Error(`Public Dashboard returned HTTP ${response.status}.`);
  const dashboard = await response.json();
  if (dashboard.dashboardId !== "about" || !Array.isArray(dashboard.widgets)) {
    throw new Error("Compiled API returned an invalid Dashboard Read Model.");
  }
  process.stdout.write(`${JSON.stringify({ command: "smoke-built-api", status: "passed" })}\n`);
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Compiled API exited before readiness. ${diagnostics}`.trim());
    }
    try {
      const response = await fetch(`${baseUrl}/ready`);
      if (response.ok) return;
    } catch {
      // The socket is expected to reject connections while Fastify starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Compiled API did not become ready. ${diagnostics}`.trim());
}
