import { randomUUID } from "node:crypto";

import {
  AuthService,
  DashboardReadService,
  DashboardService,
  ProviderAuthService,
  ProviderConnectionService,
  ProviderDataService,
  SyncService
} from "@nivalis/application";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import cors from "@fastify/cors";
import Fastify from "fastify";

import type { ApiConfig } from "../config/api-config";
import { createDatabase, type NivalisDatabase } from "../infrastructure/database/database";
import { CryptoAuthTokenFactory } from "../infrastructure/auth/auth-token-factory";
import {
  FixtureGitHubOAuthClient,
  GitHubOAuthClient
} from "../infrastructure/auth/github-oauth-client";
import {
  KyselyDashboardRepository,
  KyselyDashboardUnitOfWork
} from "../infrastructure/repositories/kysely-dashboard-repository";
import { KyselyProjectionRepository } from "../infrastructure/repositories/kysely-projection-repository";
import { KyselyAuthRepository } from "../infrastructure/repositories/kysely-auth-repository";
import {
  KyselyProviderConnectionUnitOfWork,
  KyselyProviderCredentialRepository
} from "../infrastructure/repositories/kysely-provider-credential-repository";
import { KyselySyncRepository } from "../infrastructure/repositories/kysely-sync-repository";
import { KyselyProviderAuthAttemptRepository } from "../infrastructure/repositories/kysely-provider-auth-repository";
import { KyselyProviderDataCatalogReader } from "../infrastructure/repositories/kysely-provider-data-repository";
import {
  KyselyProviderAuthEnqueueUnitOfWork,
  KyselySyncEnqueueUnitOfWork,
  PgBossRuntime
} from "../infrastructure/queue/pg-boss-sync-queue";
import { Sha256ViewVersionFactory } from "../infrastructure/projections/projection-key";
import {
  AesGcmSecretProtector,
  decodeCredentialMasterKey
} from "../infrastructure/security/aes-gcm-secret-protector";
import { authRoutes } from "../transport/http/auth-routes";
import { registerAuthorizationBoundary } from "../transport/http/auth-boundary";
import { registerProblemHandlers } from "../transport/http/problem-details";
import {
  dashboardRoutes,
  deferredRoutes,
  systemRoutes,
  widgetRoutes
} from "../transport/http/routes";
import { SystemClock } from "./system-clock";

export interface BuildApiOptions {
  readonly config: ApiConfig;
  readonly database?: NivalisDatabase;
  readonly logger?: boolean;
  readonly queueRuntime?: PgBossRuntime;
}

export function buildApi(options: BuildApiOptions) {
  const ownsDatabase = !options.database;
  const database =
    options.database ??
    createDatabase({
      connectionString: options.config.databaseUrl,
      maxConnections: options.config.databaseMaxConnections,
      ssl: options.config.databaseSsl
    });
  const dashboardRepository = new KyselyDashboardRepository(database);
  const dashboardService = new DashboardService(
    dashboardRepository,
    new KyselyDashboardUnitOfWork(database),
    new SystemClock()
  );

  const app = Fastify({
    bodyLimit: options.config.bodyLimit,
    genReqId: () => randomUUID(),
    logger:
      options.logger === false
        ? false
        : {
            level: options.config.logLevel,
            redact: {
              censor: "[REDACTED]",
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "request.headers.authorization",
                "request.headers.cookie",
                "req.body.credential",
                "request.body.credential",
                "req.body.phone",
                "request.body.phone",
                "req.body.code",
                "request.body.code"
              ]
            }
          }
  }).withTypeProvider<TypeBoxTypeProvider>();

  const clock = new SystemClock();
  const secretProtector = new AesGcmSecretProtector(
    decodeCredentialMasterKey(options.config.credentialMasterKey),
    options.config.credentialKeyId
  );
  const oauthCallbackUrl = `${options.config.apiPublicOrigin}/v1/auth/github/callback`;
  const oauth = options.config.authOauthFixtureEnabled
    ? new FixtureGitHubOAuthClient(oauthCallbackUrl, options.config.ownerGithubUserId)
    : new GitHubOAuthClient({
        clientId: options.config.githubOauthClientId,
        clientSecret: options.config.githubOauthClientSecret,
        redirectUri: oauthCallbackUrl,
        timeoutMs: 10_000
      });
  const authTokens = new CryptoAuthTokenFactory();
  const authService = new AuthService(
    new KyselyAuthRepository(database),
    oauth,
    authTokens,
    secretProtector,
    clock,
    {
      oauthStateTtlMs: options.config.authOauthStateTtlSeconds * 1_000,
      ownerActorId: options.config.ownerId,
      ownerGithubUserId: options.config.ownerGithubUserId,
      sessionTtlMs: options.config.authSessionTtlSeconds * 1_000
    }
  );

  const projectionRepository = new KyselyProjectionRepository(database);
  const readService = new DashboardReadService(
    dashboardRepository,
    projectionRepository,
    new Sha256ViewVersionFactory()
  );
  const queueRuntime =
    options.queueRuntime ??
    new PgBossRuntime(
      {
        connectionString: options.config.databaseUrl,
        deleteAfterSeconds: options.config.syncJobDeleteAfterSeconds,
        expireInSeconds: options.config.syncJobExpireSeconds,
        retryDelay: options.config.syncRetryBaseDelaySeconds,
        retryDelayMax: options.config.syncRetryMaxDelaySeconds,
        retryLimit: Math.max(0, options.config.syncMaxAttempts - 1),
        schema: options.config.syncQueueSchema
      },
      (error) =>
        app.log.error({ error: { message: error.message, name: error.name } }, "pg-boss error")
    );
  const syncService = new SyncService(
    new KyselySyncRepository(database),
    new KyselySyncEnqueueUnitOfWork(database, queueRuntime.boss),
    clock,
    (provider) =>
      (provider !== "fixture" || options.config.fixtureProviderEnabled) &&
      (provider !== "netease" || options.config.neteaseProviderEnabled)
  );
  const connectionRepository = new KyselyProviderCredentialRepository(database);
  const providerConnectionService = new ProviderConnectionService(
    connectionRepository,
    new KyselyProviderConnectionUnitOfWork(database),
    secretProtector,
    clock,
    (context, provider) => syncService.enqueue(context, provider)
  );
  const providerDataService = new ProviderDataService(
    new KyselyProviderDataCatalogReader(database)
  );
  const providerAuthService = new ProviderAuthService(
    new KyselyProviderAuthAttemptRepository(database),
    new KyselyProviderAuthEnqueueUnitOfWork(database, queueRuntime.boss),
    secretProtector,
    { create: () => authTokens.createUuid() },
    clock,
    {
      providerEnabled: options.config.neteaseProviderEnabled,
      qrTtlMs: options.config.providerAuthQrTtlSeconds * 1_000,
      smsTtlMs: options.config.providerAuthSmsTtlSeconds * 1_000
    }
  );

  app.addContentTypeParser(
    "application/merge-patch+json",
    { parseAs: "string" },
    app.getDefaultJsonParser("error", "error")
  );

  registerProblemHandlers(app);
  registerAuthorizationBoundary(app, authService, [
    options.config.appPublicOrigin,
    ...options.config.corsOrigins
  ]);

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("x-request-id", request.id);
    done();
  });

  app.register(cors, {
    allowedHeaders: ["content-type", "authorization", "if-match"],
    credentials: true,
    exposedHeaders: ["etag", "location"],
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin:
      options.config.corsOrigins.length > 0
        ? [...new Set([options.config.appPublicOrigin, ...options.config.corsOrigins])]
        : [options.config.appPublicOrigin]
  });

  const routeOptions = {
    dashboardService,
    providerAuthService,
    providerConnectionService,
    providerDataService,
    readService,
    syncService
  };

  app.register(authRoutes, {
    appPublicOrigin: options.config.appPublicOrigin,
    auth: authService,
    secureCookies: options.config.authSecureCookies
  });
  app.register(systemRoutes, routeOptions);
  app.register(dashboardRoutes, routeOptions);
  app.register(widgetRoutes, routeOptions);
  app.register(deferredRoutes, routeOptions);

  app.addHook("onReady", async () => {
    await queueRuntime.start();
  });

  app.addHook("onClose", async () => {
    await queueRuntime.stop();
    if (ownsDatabase) {
      await database.destroy();
    }
  });

  return app;
}
