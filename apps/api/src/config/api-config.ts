import { Type } from "@fastify/type-provider-typebox";
import Value from "typebox/value";

import { PHASE_TWO_OWNER_ID } from "../infrastructure/database/phase-two-fixture";

const ApiConfigSchema = Type.Object(
  {
    apiPublicOrigin: Type.String({ minLength: 1 }),
    appPublicOrigin: Type.String({ minLength: 1 }),
    authOauthFixtureEnabled: Type.Boolean(),
    authOauthStateTtlSeconds: Type.Integer({ minimum: 60, maximum: 1_800 }),
    authSecureCookies: Type.Boolean(),
    authSessionTtlSeconds: Type.Integer({ minimum: 300, maximum: 2_592_000 }),
    bodyLimit: Type.Integer({ minimum: 1 }),
    corsOrigins: Type.Array(Type.String({ minLength: 1 })),
    databaseMaxConnections: Type.Integer({ minimum: 1, maximum: 100 }),
    databaseSsl: Type.Boolean(),
    databaseUrl: Type.String({ minLength: 1 }),
    credentialKeyId: Type.String({ minLength: 1, maxLength: 120 }),
    credentialMasterKey: Type.String({ minLength: 1 }),
    fixtureProviderEnabled: Type.Boolean(),
    githubOauthClientId: Type.String({ minLength: 1 }),
    githubOauthClientSecret: Type.String({ minLength: 1 }),
    host: Type.String({ minLength: 1 }),
    logLevel: Type.Union([
      Type.Literal("fatal"),
      Type.Literal("error"),
      Type.Literal("warn"),
      Type.Literal("info"),
      Type.Literal("debug"),
      Type.Literal("trace"),
      Type.Literal("silent")
    ]),
    nodeEnv: Type.Union([
      Type.Literal("development"),
      Type.Literal("test"),
      Type.Literal("production")
    ]),
    neteaseProviderEnabled: Type.Boolean(),
    ownerId: Type.String({ pattern: "^[0-9a-fA-F-]{36}$" }),
    ownerGithubUserId: Type.String({ pattern: "^[0-9]+$" }),
    providerAuthQrTtlSeconds: Type.Integer({ minimum: 60, maximum: 600 }),
    providerAuthSmsTtlSeconds: Type.Integer({ minimum: 60, maximum: 900 }),
    port: Type.Integer({ minimum: 1, maximum: 65_535 }),
    syncJobDeleteAfterSeconds: Type.Integer({ minimum: 1 }),
    syncJobExpireSeconds: Type.Integer({ minimum: 20 }),
    syncMaxAttempts: Type.Integer({ minimum: 1, maximum: 10 }),
    syncQueueSchema: Type.String({ pattern: "^[a-z][a-z0-9_]{0,62}$" }),
    syncRetryBaseDelaySeconds: Type.Integer({ minimum: 1 }),
    syncRetryMaxDelaySeconds: Type.Integer({ minimum: 1 })
  },
  { additionalProperties: false }
);

export interface ApiConfig {
  readonly apiPublicOrigin: string;
  readonly appPublicOrigin: string;
  readonly authOauthFixtureEnabled: boolean;
  readonly authOauthStateTtlSeconds: number;
  readonly authSecureCookies: boolean;
  readonly authSessionTtlSeconds: number;
  readonly bodyLimit: number;
  readonly corsOrigins: readonly string[];
  readonly databaseMaxConnections: number;
  readonly databaseSsl: boolean;
  readonly databaseUrl: string;
  readonly credentialKeyId: string;
  readonly credentialMasterKey: string;
  readonly fixtureProviderEnabled: boolean;
  readonly githubOauthClientId: string;
  readonly githubOauthClientSecret: string;
  readonly host: string;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly nodeEnv: "development" | "test" | "production";
  readonly neteaseProviderEnabled: boolean;
  readonly ownerId: string;
  readonly ownerGithubUserId: string;
  readonly providerAuthQrTtlSeconds: number;
  readonly providerAuthSmsTtlSeconds: number;
  readonly port: number;
  readonly syncJobDeleteAfterSeconds: number;
  readonly syncJobExpireSeconds: number;
  readonly syncMaxAttempts: number;
  readonly syncQueueSchema: string;
  readonly syncRetryBaseDelaySeconds: number;
  readonly syncRetryMaxDelaySeconds: number;
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = environment.NODE_ENV ?? "development";
  const port = parseInteger(environment.API_PORT, 3_001);
  const testMode = nodeEnv === "test";
  const authOauthFixtureEnabled = parseBoolean(environment.AUTH_OAUTH_FIXTURE_ENABLED, testMode);
  if (nodeEnv === "production" && authOauthFixtureEnabled) {
    throw new Error("AUTH_OAUTH_FIXTURE_ENABLED cannot be true in production.");
  }
  const authSecureCookies = parseBoolean(environment.AUTH_SECURE_COOKIES, nodeEnv === "production");
  if (nodeEnv === "production" && !authSecureCookies) {
    throw new Error("AUTH_SECURE_COOKIES must be true in production.");
  }
  const fixtureProviderEnabled = parseBoolean(
    environment.FIXTURE_PROVIDER_ENABLED,
    nodeEnv !== "production"
  );
  if (nodeEnv === "production" && fixtureProviderEnabled) {
    throw new Error("FIXTURE_PROVIDER_ENABLED cannot be true in production.");
  }

  const candidate = {
    apiPublicOrigin: environment.API_PUBLIC_ORIGIN ?? (testMode ? `http://127.0.0.1:${port}` : ""),
    appPublicOrigin: environment.APP_PUBLIC_ORIGIN ?? (testMode ? "http://127.0.0.1:4174" : ""),
    authOauthFixtureEnabled,
    authOauthStateTtlSeconds: parseInteger(environment.AUTH_OAUTH_STATE_TTL_SECONDS, 600),
    authSecureCookies,
    authSessionTtlSeconds: parseInteger(environment.AUTH_SESSION_TTL_SECONDS, 86_400),
    bodyLimit: parseInteger(environment.API_BODY_LIMIT, 1_048_576),
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS),
    databaseMaxConnections: parseInteger(environment.DATABASE_MAX_CONNECTIONS, 10),
    databaseSsl: parseBoolean(environment.DATABASE_SSL, false),
    databaseUrl: environment.DATABASE_URL ?? "",
    credentialKeyId: environment.NIVALIS_CREDENTIAL_KEY_ID ?? "primary",
    credentialMasterKey:
      environment.NIVALIS_CREDENTIAL_MASTER_KEY ??
      (testMode ? Buffer.alloc(32, 7).toString("base64url") : ""),
    fixtureProviderEnabled,
    githubOauthClientId:
      environment.GITHUB_OAUTH_CLIENT_ID ?? (testMode ? "test-oauth-client" : ""),
    githubOauthClientSecret:
      environment.GITHUB_OAUTH_CLIENT_SECRET ?? (testMode ? "test-oauth-secret" : ""),
    host: environment.API_HOST ?? "127.0.0.1",
    logLevel: environment.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info"),
    nodeEnv,
    neteaseProviderEnabled: parseBoolean(environment.NETEASE_PROVIDER_ENABLED, true),
    ownerId: environment.NIVALIS_OWNER_ID ?? PHASE_TWO_OWNER_ID,
    ownerGithubUserId: environment.OWNER_GITHUB_USER_ID ?? (testMode ? "1000001" : ""),
    providerAuthQrTtlSeconds: parseInteger(environment.PROVIDER_AUTH_QR_TTL_SECONDS, 180),
    providerAuthSmsTtlSeconds: parseInteger(environment.PROVIDER_AUTH_SMS_TTL_SECONDS, 300),
    port,
    syncJobDeleteAfterSeconds: parseInteger(environment.SYNC_JOB_DELETE_AFTER_SECONDS, 86_400),
    syncJobExpireSeconds: parseInteger(environment.SYNC_JOB_EXPIRE_SECONDS, 120),
    syncMaxAttempts: parseInteger(environment.SYNC_MAX_ATTEMPTS, 3),
    syncQueueSchema: environment.SYNC_QUEUE_SCHEMA ?? "pgboss",
    syncRetryBaseDelaySeconds: parseInteger(environment.SYNC_RETRY_BASE_DELAY_SECONDS, 1),
    syncRetryMaxDelaySeconds: parseInteger(environment.SYNC_RETRY_MAX_DELAY_SECONDS, 30)
  };

  try {
    const parsed = Value.Parse(ApiConfigSchema, candidate) as ApiConfig;
    for (const origin of [parsed.apiPublicOrigin, parsed.appPublicOrigin, ...parsed.corsOrigins]) {
      const url = new URL(origin);
      if (!url.protocol.startsWith("http")) throw new Error("unsupported protocol");
    }
    if (Buffer.from(parsed.credentialMasterKey, "base64url").byteLength !== 32) {
      throw new Error("invalid credential master key");
    }
    return parsed;
  } catch {
    throw new Error("Invalid Nivalis API environment configuration.");
  }
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value === "") return fallback;
  return Number(value);
}

function parseCorsOrigins(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
