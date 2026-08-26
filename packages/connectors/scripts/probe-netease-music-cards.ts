import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createNeteaseHttpFixtureFetcher,
  NeteaseClient,
  probeNeteaseMusicCards
} from "../src/index";

const fixtureMode = process.argv.includes("--fixture");
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const localEnvironment = `${workspaceRoot}.env.local`;

if (!fixtureMode && existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);

const credential = fixtureMode
  ? "nivalis-local-fixture-credential"
  : process.env.NETEASE_INTEGRATION_MUSIC_U?.trim();

if (!credential) {
  console.error(
    "NETEASE_INTEGRATION_MUSIC_U is missing. Put it in the ignored repository-root .env.local, or run with --fixture."
  );
  process.exitCode = 1;
} else {
  const client = new NeteaseClient(
    { timeoutMs: 10_000 },
    fixtureMode ? createNeteaseHttpFixtureFetcher("normal") : undefined
  );
  try {
    const result = await probeNeteaseMusicCards(client, credential);
    console.log(
      JSON.stringify(
        {
          ...result,
          mode: fixtureMode ? "fixture" : "real_provider"
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? `NetEase music-card probe failed: ${error.name}: ${error.message}`
        : "NetEase music-card probe failed."
    );
    process.exitCode = 1;
  }
}
