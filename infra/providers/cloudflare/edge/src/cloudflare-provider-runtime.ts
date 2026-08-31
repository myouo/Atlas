import {
  ProviderAuthService,
  ProviderAuthWorkerService,
  ProviderConnectionService
} from "@nivalis/application";
import type {
  ProviderAuthAttemptRepository,
  ProviderAuthEnqueueUnitOfWork,
  ProviderAuthJobQueue,
  ProviderAuthRuntimeRegistry
} from "@nivalis/application";
import {
  createNeteaseHttpFixtureFetcher,
  NeteaseAuthClient,
  type NeteaseHttpFixtureScenario
} from "@nivalis/connectors";

import {
  CloudflareProviderAuthJobQueue,
  type CloudflareQueueMessage
} from "./cloudflare-sync-queue";
import { D1NeteaseSyncRuntime } from "./d1-netease-sync";
import { D1ProviderAuthAttemptRepository } from "./d1-provider-auth-repository";
import {
  D1ProviderConnectionUnitOfWork,
  D1ProviderCredentialRepository
} from "./d1-provider-credential-repository";
import { decodeBase64UrlKey, WebCryptoSecretProtector } from "./web-crypto-auth";

export interface ProviderEnvironment {
  readonly ENVIRONMENT?: string;
  readonly NIVALIS_CREDENTIAL_KEY_ID?: string;
  readonly NIVALIS_CREDENTIAL_MASTER_KEY?: string;
  readonly NETEASE_HTTP_FIXTURE_SCENARIO?: string;
  readonly NETEASE_REQUEST_CONCURRENCY?: string;
  readonly NETEASE_REQUEST_TIMEOUT_MS?: string;
}

export function createCloudflareProviderRuntime(
  database: D1Database,
  queue: Queue<CloudflareQueueMessage>,
  environment: ProviderEnvironment
) {
  const masterKey = environment.NIVALIS_CREDENTIAL_MASTER_KEY?.trim();
  if (!masterKey) return null;
  const protector = new WebCryptoSecretProtector(
    decodeBase64UrlKey(masterKey),
    environment.NIVALIS_CREDENTIAL_KEY_ID?.trim() || "primary"
  );
  const fetcher = providerFetcher(environment);
  const repository = new D1ProviderCredentialRepository(database);
  const sync = new D1NeteaseSyncRuntime(
    database,
    queue,
    protector,
    positiveInteger(environment.NETEASE_REQUEST_TIMEOUT_MS, 12_000),
    boundedInteger(environment.NETEASE_REQUEST_CONCURRENCY, 4, 1, 4),
    fetcher
  );
  const connections = new ProviderConnectionService(
    repository,
    new D1ProviderConnectionUnitOfWork(database),
    protector,
    { now: () => new Date() },
    (context) => sync.enqueue(context.actorId)
  );
  const attemptRepository = new D1ProviderAuthAttemptRepository(database);
  const authQueue = new CloudflareProviderAuthJobQueue(queue);
  const auth = new ProviderAuthService(
    attemptRepository,
    new D1ProviderAuthEnqueueUnitOfWork(database),
    protector,
    { create: () => crypto.randomUUID() },
    { now: () => new Date() },
    { providerEnabled: true, qrTtlMs: 180_000, smsTtlMs: 300_000 }
  );
  const authWorker = new ProviderAuthWorkerService(
    attemptRepository,
    authQueue,
    new SingleNeteaseAuthRegistry(
      new NeteaseAuthClient(
        {
          timeoutMs: positiveInteger(environment.NETEASE_REQUEST_TIMEOUT_MS, 12_000)
        },
        fetcher
      )
    ),
    protector,
    { now: () => new Date() },
    (context, credential, attemptCreatedAt) =>
      connections.connectNeteaseFromAuthAttempt(context, credential, attemptCreatedAt),
    { leaseMs: 20_000, maxFailures: 3, qrPollIntervalMs: 2_000, smsResendDelayMs: 30_000 }
  );
  return { auth, authQueue, authWorker, connections, sync };
}

class D1ProviderAuthEnqueueUnitOfWork implements ProviderAuthEnqueueUnitOfWork {
  constructor(private readonly database: D1Database) {}

  run<T>(
    work: (repository: ProviderAuthAttemptRepository, queue: ProviderAuthJobQueue) => Promise<T>
  ) {
    return work(
      new D1ProviderAuthAttemptRepository(this.database),
      new DeferredProviderAuthJobQueue()
    );
  }
}

class DeferredProviderAuthJobQueue implements ProviderAuthJobQueue {
  async enqueue() {
    // The Cloudflare fetch handler starts the first step through waitUntil().
    // ProviderAuthWorkerService uses the real Queue adapter for every follow-up.
    return crypto.randomUUID();
  }
}

class SingleNeteaseAuthRegistry implements ProviderAuthRuntimeRegistry {
  constructor(private readonly runtime: NeteaseAuthClient) {}

  get(provider: "netease") {
    return provider === "netease" ? this.runtime : null;
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function providerFetcher(environment: ProviderEnvironment) {
  const scenario = environment.NETEASE_HTTP_FIXTURE_SCENARIO?.trim();
  if (!scenario)
    return (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      globalThis.fetch(input, init);
  if (environment.ENVIRONMENT !== "test" || !isFixtureScenario(scenario)) {
    throw new Error("The NetEase fixture transport is restricted to the test environment.");
  }
  return createNeteaseHttpFixtureFetcher(scenario);
}

function isFixtureScenario(value: string): value is NeteaseHttpFixtureScenario {
  return (
    value === "normal" ||
    value === "credential_expired" ||
    value === "schema_drift" ||
    value === "large"
  );
}
