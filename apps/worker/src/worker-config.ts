import type { FixtureScenario, NeteaseHttpFixtureScenario } from "@nivalis/connectors";

export interface WorkerConfig {
  readonly credentialKeyId: string;
  readonly credentialMasterKey: string;
  readonly databaseMaxConnections: number;
  readonly databaseSsl: boolean;
  readonly databaseUrl: string;
  readonly fixtureProviderEnabled: boolean;
  readonly fixtureScenario: FixtureScenario;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly neteaseProviderEnabled: boolean;
  readonly neteaseHttpFixtureEnabled: boolean;
  readonly neteaseHttpFixtureScenario: NeteaseHttpFixtureScenario;
  readonly neteaseRequestTimeoutMs: number;
  readonly nodeEnv: "development" | "test" | "production";
  readonly providerAuthLeaseSeconds: number;
  readonly providerAuthQrPollSeconds: number;
  readonly providerAuthSmsResendSeconds: number;
  readonly syncJobDeleteAfterSeconds: number;
  readonly syncJobExpireSeconds: number;
  readonly syncMaxAttempts: number;
  readonly syncPollIntervalSeconds: number;
  readonly syncQueueSchema: string;
  readonly syncRetryBaseDelaySeconds: number;
  readonly syncRetryMaxDelaySeconds: number;
}

const scenarios: readonly FixtureScenario[] = [
  "success",
  "retry_then_success",
  "permanent_failure",
  "normalization_failure",
  "projection_failure"
];
const neteaseHttpFixtureScenarios: readonly NeteaseHttpFixtureScenario[] = [
  "normal",
  "credential_expired",
  "schema_drift"
];

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV);
  const fixtureProviderEnabled = parseBoolean(
    environment.FIXTURE_PROVIDER_ENABLED,
    nodeEnv !== "production"
  );
  if (nodeEnv === "production" && fixtureProviderEnabled) {
    throw new Error("FIXTURE_PROVIDER_ENABLED cannot be true in production.");
  }
  const neteaseHttpFixtureEnabled = parseBoolean(environment.NETEASE_HTTP_FIXTURE_ENABLED, false);
  if (nodeEnv === "production" && neteaseHttpFixtureEnabled) {
    throw new Error("NETEASE_HTTP_FIXTURE_ENABLED cannot be true in production.");
  }
  const neteaseHttpFixtureScenario = (environment.NETEASE_HTTP_FIXTURE_SCENARIO ??
    "normal") as NeteaseHttpFixtureScenario;
  if (!neteaseHttpFixtureScenarios.includes(neteaseHttpFixtureScenario)) {
    throw new Error("NETEASE_HTTP_FIXTURE_SCENARIO is invalid.");
  }
  const fixtureScenario = (environment.FIXTURE_PROVIDER_SCENARIO ?? "success") as FixtureScenario;
  if (!scenarios.includes(fixtureScenario)) {
    throw new Error("FIXTURE_PROVIDER_SCENARIO is invalid.");
  }
  const config: WorkerConfig = {
    credentialKeyId: environment.NIVALIS_CREDENTIAL_KEY_ID ?? "primary",
    credentialMasterKey:
      environment.NIVALIS_CREDENTIAL_MASTER_KEY ??
      (nodeEnv === "test" ? Buffer.alloc(32, 7).toString("base64url") : ""),
    databaseMaxConnections: parseInteger(environment.DATABASE_MAX_CONNECTIONS, 5, 1, 100),
    databaseSsl: parseBoolean(environment.DATABASE_SSL, false),
    databaseUrl: required(environment.DATABASE_URL, "DATABASE_URL"),
    fixtureProviderEnabled,
    fixtureScenario,
    logLevel: parseLogLevel(environment.LOG_LEVEL, nodeEnv === "test" ? "silent" : "info"),
    neteaseProviderEnabled: parseBoolean(environment.NETEASE_PROVIDER_ENABLED, true),
    neteaseHttpFixtureEnabled,
    neteaseHttpFixtureScenario,
    neteaseRequestTimeoutMs: parseInteger(environment.NETEASE_REQUEST_TIMEOUT_MS, 10_000, 500),
    nodeEnv,
    providerAuthLeaseSeconds: parseInteger(environment.PROVIDER_AUTH_LEASE_SECONDS, 20, 5, 120),
    providerAuthQrPollSeconds: parseNumber(environment.PROVIDER_AUTH_QR_POLL_SECONDS, 2, 0.5),
    providerAuthSmsResendSeconds: parseInteger(
      environment.PROVIDER_AUTH_SMS_RESEND_SECONDS,
      30,
      10,
      300
    ),
    syncJobDeleteAfterSeconds: parseInteger(environment.SYNC_JOB_DELETE_AFTER_SECONDS, 86_400, 1),
    syncJobExpireSeconds: parseInteger(environment.SYNC_JOB_EXPIRE_SECONDS, 120, 20),
    syncMaxAttempts: parseInteger(environment.SYNC_MAX_ATTEMPTS, 3, 1, 10),
    syncPollIntervalSeconds: parseNumber(environment.SYNC_POLL_INTERVAL_SECONDS, 0.5, 0.5),
    syncQueueSchema: environment.SYNC_QUEUE_SCHEMA ?? "pgboss",
    syncRetryBaseDelaySeconds: parseInteger(environment.SYNC_RETRY_BASE_DELAY_SECONDS, 1, 1),
    syncRetryMaxDelaySeconds: parseInteger(environment.SYNC_RETRY_MAX_DELAY_SECONDS, 30, 1)
  };
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(config.syncQueueSchema)) {
    throw new Error("SYNC_QUEUE_SCHEMA is invalid.");
  }
  if (
    !config.credentialKeyId ||
    Buffer.from(config.credentialMasterKey, "base64url").byteLength !== 32
  ) {
    throw new Error("NIVALIS_CREDENTIAL_MASTER_KEY must be base64url-encoded 32 bytes.");
  }
  if (config.syncRetryMaxDelaySeconds < config.syncRetryBaseDelaySeconds) {
    throw new Error("SYNC_RETRY_MAX_DELAY_SECONDS must not be less than the base delay.");
  }
  return config;
}

function required(value: string | undefined, key: string) {
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function parseNodeEnvironment(value: string | undefined): WorkerConfig["nodeEnv"] {
  const candidate = value ?? "development";
  if (candidate === "development" || candidate === "test" || candidate === "production") {
    return candidate;
  }
  throw new Error("NODE_ENV is invalid.");
}

function parseLogLevel(
  value: string | undefined,
  fallback: WorkerConfig["logLevel"]
): WorkerConfig["logLevel"] {
  const candidate = value ?? fallback;
  if (["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(candidate)) {
    return candidate as WorkerConfig["logLevel"];
  }
  throw new Error("LOG_LEVEL is invalid.");
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Boolean environment value is invalid.");
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Infinity
) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Integer environment value is invalid.");
  }
  return parsed;
}

function parseNumber(value: string | undefined, fallback: number, minimum: number) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error("Numeric environment value is invalid.");
  }
  return parsed;
}
