import process from "node:process";

import { ProviderReplayService } from "@nivalis/application";
import {
  KyselyNeteaseNativeStore,
  NeteaseProviderRuntime,
  SteamProviderRuntime,
  type NeteaseNativeDatabase
} from "@nivalis/connectors";
import {
  AesGcmSecretProtector,
  createDatabase,
  CryptoSyncIdentityFactory,
  decodeCredentialMasterKey,
  KyselyProjectionRepository,
  KyselyProviderCredentialResolver,
  KyselySyncUnitOfWork,
  KyselySteamCatalogStore,
  loadRootEnvironment,
  SystemClock
} from "@nivalis/api/sync-runtime";
import type { Transaction } from "kysely";

import { StaticProviderNativeStoreRegistry, StaticProviderRuntimeRegistry } from "../index";
import { loadWorkerConfig } from "../worker-config";

async function main() {
  loadRootEnvironment();
  const options = parseArguments(process.argv.slice(2));
  const config = loadWorkerConfig();
  if (config.nodeEnv === "production" && options.commit) {
    throw new Error("Projection replay commit is disabled in production by this CLI.");
  }
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databaseMaxConnections,
    ssl: config.databaseSsl
  });
  try {
    const protector = new AesGcmSecretProtector(
      decodeCredentialMasterKey(config.credentialMasterKey),
      config.credentialKeyId
    );
    const runtime =
      options.provider === "steam"
        ? new SteamProviderRuntime(new KyselyProviderCredentialResolver(database, protector))
        : new NeteaseProviderRuntime(new KyselyProviderCredentialResolver(database, protector), {
            timeoutMs: config.neteaseRequestTimeoutMs
          });
    const service = new ProviderReplayService(
      new KyselySyncUnitOfWork(
        database,
        (transaction) =>
          new StaticProviderNativeStoreRegistry([
            new KyselySteamCatalogStore(transaction),
            new KyselyNeteaseNativeStore(
              transaction as unknown as Transaction<NeteaseNativeDatabase>
            )
          ])
      ),
      new KyselyProjectionRepository(database),
      new StaticProviderRuntimeRegistry([runtime]),
      new CryptoSyncIdentityFactory(),
      new SystemClock()
    );
    const result = await service.replay(options.snapshotId, options.commit);
    write({
      committed: result.committed,
      diff: result.diff,
      normalized: result.normalized,
      projections: result.projections,
      provider: result.provider,
      snapshotIds: result.snapshotIds,
      sources: result.sources,
      syncRunId: result.syncRunId
    });
  } finally {
    await database.destroy();
  }
}

function parseArguments(values: readonly string[]) {
  let provider: string | null = null;
  let snapshotId: string | null = null;
  let commit = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--commit") {
      commit = true;
      continue;
    }
    if (value === "--provider") {
      provider = values[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--snapshot") {
      snapshotId = values[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error("Unknown provider replay argument.");
  }
  if (provider !== "netease" && provider !== "steam")
    throw new Error("Replay supports --provider netease or steam.");
  if (!snapshotId || !/^[0-9a-fA-F-]{36}$/.test(snapshotId)) {
    throw new Error("Replay requires --snapshot <uuid>.");
  }
  return { commit, snapshotId, provider };
}

function write(value: unknown, stderr = false) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  (stderr ? process.stderr : process.stdout).write(output);
}

main().catch((error: unknown) => {
  write(
    {
      error: "Provider replay failed.",
      message: error instanceof Error ? error.message : "Unknown error"
    },
    true
  );
  process.exitCode = 1;
});
