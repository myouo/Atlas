import { spawn } from "node:child_process";
import process from "node:process";

const port = 8_791;
const baseUrl = `http://127.0.0.1:${port}`;
const testMasterKey = Buffer.alloc(32, 7).toString("base64url");

await run("pnpm", ["d1:migrate:local"]);
await run("pnpm", ["d1:seed:local"]);

const worker = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--config",
    "infra/providers/cloudflare/edge/wrangler.jsonc",
    "--port",
    String(port),
    "--var",
    "API_PUBLIC_ORIGIN:http://127.0.0.1:8791/api",
    "--var",
    "APP_PUBLIC_ORIGIN:http://127.0.0.1:3000",
    "--var",
    "GITHUB_OAUTH_CLIENT_ID:test-client",
    "--var",
    "GITHUB_OAUTH_CLIENT_SECRET:test-secret",
    "--var",
    `NIVALIS_CREDENTIAL_MASTER_KEY:${testMasterKey}`,
    "--var",
    "NIVALIS_CREDENTIAL_KEY_ID:test-key",
    "--var",
    "NIVALIS_OWNER_ID:00000000-0000-4000-8000-000000000001",
    "--var",
    "OWNER_GITHUB_USER_ID:1"
  ],
  { env: process.env, stdio: ["ignore", "pipe", "pipe"] }
);
let output = "";
worker.stdout.on("data", (chunk) => {
  output += String(chunk);
});
worker.stderr.on("data", (chunk) => {
  output += String(chunk);
});

try {
  await waitUntilReady();
  const health = await fetchJson("/health");
  const ready = await fetchJson("/ready");
  const dashboard = await fetchJson("/v1/public/dashboards/about");
  const session = await fetchJson("/v1/auth/session");
  const authStart = await fetchJson("/v1/auth/github/start", { method: "POST" });

  assert(health.response.status === 200, "health did not return 200");
  assert(ready.response.status === 200, "readiness did not return 200");
  assert(dashboard.response.status === 200, "public Dashboard did not return 200");
  assert(dashboard.body.dashboardId === "about", "unexpected Dashboard slug");
  assert(dashboard.body.widgets?.length === 10, "unexpected D1 Widget count");
  assert(
    /^"view:[0-9a-f]{64}"$/.test(dashboard.response.headers.get("etag") ?? ""),
    "invalid view ETag"
  );
  assert(session.body.authenticated === false, "D1 preview must not manufacture an Owner session");
  assert(authStart.response.status === 200, "GitHub authentication did not start");
  const authorizationUrl = new URL(authStart.body.authorizationUrl);
  assert(authorizationUrl.hostname === "github.com", "unexpected GitHub authorization host");
  assert(Boolean(authorizationUrl.searchParams.get("state")), "OAuth state is missing");
  assert(Boolean(authorizationUrl.searchParams.get("code_challenge")), "PKCE challenge is missing");
  assert(
    new URL(authorizationUrl.searchParams.get("redirect_uri")).pathname ===
      "/api/v1/auth/github/callback",
    "OAuth callback did not preserve the same-origin API prefix"
  );

  process.stdout.write(`${JSON.stringify({ command: "smoke-d1-worker", status: "passed" })}\n`);
} finally {
  worker.kill("SIGTERM");
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Wrangler exited early.\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The local Worker has not opened its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the D1 Worker.\n${output}`);
}

async function fetchJson(pathname, init) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  return { body: await response.json(), response };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
