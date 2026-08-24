import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";

const port = 8_791;
const baseUrl = `http://127.0.0.1:${port}`;
const testMasterKey = Buffer.alloc(32, 7).toString("base64url");
const ownerId = "00000000-0000-4000-8000-000000000001";
const ownerToken = "nivalis-local-owner-session";
const ownerTokenHash = createHash("sha256").update(ownerToken).digest("hex");
const sessionCreatedAt = new Date().toISOString();
const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();

await run("pnpm", ["d1:migrate:local"]);
await run("pnpm", ["d1:seed:local"]);
await executeLocalSql(`
  DELETE FROM provider_raw_snapshots;
  DELETE FROM provider_sync_runs;
  DELETE FROM provider_credentials;
  DELETE FROM provider_auth_attempts;
  DELETE FROM provider_sync_states;
  DELETE FROM provider_connections;
  INSERT INTO actors (id, role, created_at, updated_at)
    VALUES ('${ownerId}', 'owner', '${sessionCreatedAt}', '${sessionCreatedAt}')
    ON CONFLICT(id) DO UPDATE SET role = 'owner', updated_at = excluded.updated_at;
  INSERT INTO auth_sessions (id, actor_id, token_hash, created_at, expires_at, revoked_at)
    VALUES ('00000000-0000-4000-8000-000000000901', '${ownerId}', '${ownerTokenHash}', '${sessionCreatedAt}', '${sessionExpiresAt}', NULL)
    ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at, revoked_at = NULL;
`);

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
    "ENVIRONMENT:test",
    "--var",
    `NIVALIS_CREDENTIAL_MASTER_KEY:${testMasterKey}`,
    "--var",
    "NIVALIS_CREDENTIAL_KEY_ID:test-key",
    "--var",
    `NIVALIS_OWNER_ID:${ownerId}`,
    "--var",
    "OWNER_GITHUB_USER_ID:1",
    "--var",
    "NETEASE_HTTP_FIXTURE_SCENARIO:normal"
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

  const ownerHeaders = {
    "content-type": "application/json",
    cookie: `nivalis_session=${ownerToken}`
  };
  const ownerSession = await fetchJson("/v1/auth/session", { headers: ownerHeaders });
  assert(ownerSession.body.role === "owner", "the D1 fixture Owner session was not accepted");

  const accepted = await fetchJson("/v1/me/providers/netease/connect", {
    body: JSON.stringify({
      credential: "nivalis_fixture_music_u_credential",
      credentialType: "music_u"
    }),
    headers: ownerHeaders,
    method: "POST"
  });
  assert(accepted.response.status === 202, "MUSIC_U connection was not accepted");
  const completedJob = await pollJson(
    `/v1/me/sync-jobs/${accepted.body.validationJob.jobId}`,
    ownerHeaders,
    (body) => body.status === "completed" || body.status === "failed"
  );
  assert(completedJob.status === "completed", "fixture credential validation did not complete");
  const connected = await fetchJson("/v1/me/providers/netease", { headers: ownerHeaders });
  assert(connected.body.configured === true, "credential metadata was not persisted");
  assert(connected.body.credentialStatus === "valid", "credential was not marked valid");

  const disconnected = await fetch(`${baseUrl}/v1/me/providers/netease/connection`, {
    headers: ownerHeaders,
    method: "DELETE"
  });
  assert(disconnected.status === 204, "NetEase disconnect did not return 204");
  const refreshed = await fetchJson("/v1/me/providers/netease", { headers: ownerHeaders });
  assert(refreshed.body.configured === false, "disconnect left credential metadata configured");
  assert(refreshed.body.enabled === false, "disconnect left the Provider connection enabled");

  const qrStarted = await fetchJson("/v1/me/providers/netease/auth-attempts/qr", {
    headers: ownerHeaders,
    method: "POST"
  });
  assert(qrStarted.response.status === 202, "NetEase QR login was not accepted");
  const qrAttempt = await pollJson(
    `/v1/me/providers/netease/auth-attempts/${qrStarted.body.attemptId}`,
    ownerHeaders,
    (body) => Boolean(body.qrUrl) || body.status === "failed"
  );
  assert(qrAttempt.qrUrl?.startsWith("https://music.163.com/login?codekey="), "QR URL missing");
  const whileQrActive = await fetchJson("/v1/me/providers/netease", {
    headers: ownerHeaders
  });
  assert(
    whileQrActive.body.configured === false,
    "a fresh QR attempt reused the disconnected MUSIC_U credential"
  );
  const cancelled = await fetch(
    `${baseUrl}/v1/me/providers/netease/auth-attempts/${qrStarted.body.attemptId}`,
    { headers: ownerHeaders, method: "DELETE" }
  );
  assert(cancelled.status === 204, "QR attempt cancellation did not return 204");

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

async function pollJson(pathname, headers, done) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await fetchJson(pathname, { headers });
    if (done(result.body)) return result.body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out polling ${pathname}.\n${output}`);
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

function executeLocalSql(sql) {
  return run("pnpm", [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "infra/providers/cloudflare/edge/wrangler.jsonc",
    "--command",
    sql
  ]);
}
