import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it, vi } from "vitest";
import {
  assertProviderManifest,
  assertNormalizedProviderData,
  assertProviderProjectionBatch,
  assertProviderProjectionSet,
  collectProviderData
} from "@nivalis/application";
import {
  encodeProviderSourceContext,
  providerProtocolMetadata,
  ProviderCredentialError,
  ProviderSchemaMismatchError,
  RetryableProviderError,
  toProviderSnapshotRecord,
  toProviderSyncRequest
} from "@nivalis/domain";
import type { ProviderNormalizationInput, ProjectionTarget, SyncRun } from "@nivalis/domain";
import { SteamProviderRuntime } from "./steam-provider-runtime";
import { SteamClient } from "./steam-client";
import { createSteamFixtureFetcher, steamFixtureId, type SteamFixtureScenario } from "./fixtures";

const apiKey = "a".repeat(32);
const run: SyncRun = {
  id: "00000000-0000-4000-8000-000000000901",
  providerConnectionId: "00000000-0000-4000-8000-000000000902",
  provider: "steam",
  attemptCount: 1,
  requestedAt: new Date("2026-09-06T00:00:00.000Z"),
  startedAt: null,
  finishedAt: null,
  queueJobId: null,
  status: "running",
  lastErrorCode: null,
  lastErrorMessage: null
};
const target: ProjectionTarget = {
  id: "00000000-0000-4000-8000-000000000903",
  provider: "steam",
  type: "steam.profile",
  schemaVersion: 2,
  enabled: true,
  title: "Steam",
  dataConfig: { shareProfile: true, shareLibrary: true, shareRecentGames: true },
  presentationConfig: {},
  projectionKey: "steam-projection"
};
function runtime(
  scenario: SteamFixtureScenario = "normal",
  fetcher = createSteamFixtureFetcher(scenario)
) {
  return new SteamProviderRuntime(
    { resolve: async () => JSON.stringify({ apiKey, steamId: steamFixtureId }) },
    { timeoutMs: 100 },
    fetcher
  );
}
async function pipeline(scenario: SteamFixtureScenario = "normal") {
  const provider = runtime(scenario);
  assertProviderManifest(provider.manifest, "steam");
  const collection = await collectProviderData(provider, run);
  const records = collection.records.map((record, index) =>
    toProviderSnapshotRecord({
      id: `00000000-0000-4000-8000-00000000091${index}`,
      provider: "steam",
      providerConnectionId: run.providerConnectionId,
      syncRunId: run.id,
      sourceKind: record.meta.source,
      schemaVersion: 1,
      payload: record.data,
      payloadHash: "f".repeat(64),
      fetchedAt: new Date(record.meta.collectedAt),
      createdAt: run.requestedAt,
      sourceTimestamp: null,
      sourceCursor: encodeProviderSourceContext(record, collection)
    })
  );
  const input: ProviderNormalizationInput = {
    data: {
      records,
      collectionMode: collection.mode,
      collectionOutcome: collection.outcome,
      issues: collection.issues,
      checkpoint: null,
      previous: null
    },
    meta: providerProtocolMetadata("normalization.request", "steam", run.id)
  };
  const normalized = await provider.normalizer.normalize(input);
  assertNormalizedProviderData(normalized, provider.manifest, input, run.id);
  const projections = await provider.projector.project({
    data: { normalized, targets: [target] },
    meta: providerProtocolMetadata("projection.request", "steam", run.id)
  });
  assertProviderProjectionBatch(projections, provider.manifest, run.id);
  assertProviderProjectionSet([target], projections.data, normalized);
  return { provider, collection, input, normalized, projections };
}

describe("Steam Provider v2 integration", () => {
  it("collects replayable evidence, normalizes minutes and emits only selected public fields", async () => {
    const { collection, normalized, projections, provider, input } = await pipeline();
    expect(collection.records).toHaveLength(4);
    expect(normalized.data).toMatchObject({
      account: { steamId: steamFixtureId, level: 12 },
      library: { gameCount: 2, playtimeMinutes: 125, playedGameCount: 1 }
    });
    expect(projections.data[0]?.data).toMatchObject({
      provider: "steam",
      recentGames: { items: [{ appId: 10, recentPlaytimeMinutes: 20 }, { appId: 20 }] }
    });
    const serialized = JSON.stringify({ collection, normalized, projections });
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("realname");
    expect(serialized).not.toContain("Not for public disclosure");
    const replay = await provider.normalizer.normalize(input);
    expect(replay).toEqual(normalized);
    const hidden = await provider.projector.project({
      data: {
        normalized,
        targets: [
          {
            ...target,
            dataConfig: { shareProfile: false, shareLibrary: false, shareRecentGames: false }
          }
        ]
      },
      meta: providerProtocolMetadata("projection.request", "steam", run.id)
    });
    expect(JSON.stringify(hidden.data)).not.toContain(steamFixtureId);
    expect(JSON.stringify(hidden.data)).not.toContain("Fixture Game");
  });
  it("sends a key only in an HTTPS header, with no redirect following", async () => {
    const fetcher = vi.fn(createSteamFixtureFetcher());
    await runtime("normal", fetcher).connector.collect(toProviderSyncRequest(run));
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain(apiKey);
      expect(new Headers(init?.headers).get("x-webapi-key")).toBe(apiKey);
      expect(init?.redirect).toBe("error");
    }
  });
  it("defaults recent titles to private and rejects invalid disclosure options", async () => {
    const { provider, normalized } = await pipeline();
    const project = (dataConfig: ProjectionTarget["dataConfig"]) =>
      provider.projector.project({
        data: { normalized, targets: [{ ...target, dataConfig }] },
        meta: providerProtocolMetadata("projection.request", "steam", run.id)
      });
    const defaults = await project({});
    expect(defaults.data[0]?.data).toMatchObject({
      recentGames: { availability: "unavailable", reason: "not_shared" }
    });
    expect(JSON.stringify(defaults.data)).not.toContain("Fixture Game");
    await expect(project({ shareRecentGames: "false" })).rejects.toThrow("disclosure");
    await expect(project({ shareAll: true })).rejects.toThrow("disclosure");
  });
  it("distinguishes private, empty, and hidden playtime without fabricated zeros", async () => {
    const privateData = await pipeline("private");
    expect(privateData.collection.outcome).toBe("partial");
    expect(privateData.normalized.data.library).toEqual({
      availability: "unavailable",
      reason: "private"
    });
    expect((await pipeline("empty")).normalized.data.library).toMatchObject({
      availability: "available",
      gameCount: 0,
      playtimeMinutes: 0
    });
    expect((await pipeline("hidden_playtime")).normalized.data.library).toMatchObject({
      availability: "available",
      gameCount: 2,
      playtimeMinutes: null,
      playedGameCount: null
    });
  });
  it("keeps credential failures separate from retryable rate limits", async () => {
    await expect(
      runtime("invalid_key").connector.collect(toProviderSyncRequest(run))
    ).rejects.toBeInstanceOf(ProviderCredentialError);
    await expect(
      runtime("rate_limit").connector.collect(toProviderSyncRequest(run))
    ).rejects.toMatchObject({ retryable: true, retryAfterMs: 2000 });
  });
  it("rejects mismatched accounts and malformed collection coverage", async () => {
    const real = createSteamFixtureFetcher();
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).includes("GetPlayerSummaries"))
        return Response.json({
          response: {
            players: [{ steamid: "123", personaname: "Wrong account", communityvisibilitystate: 3 }]
          }
        });
      return real(input, init);
    };
    await expect(
      runtime("normal", fetcher).connector.collect(toProviderSyncRequest(run))
    ).rejects.toBeInstanceOf(ProviderSchemaMismatchError);
    const broken: typeof fetch = async (input, init) =>
      String(input).includes("GetOwnedGames")
        ? Response.json({ response: { game_count: 7, games: [] } })
        : real(input, init);
    await expect(
      runtime("normal", broken).connector.collect(toProviderSyncRequest(run))
    ).rejects.toBeInstanceOf(ProviderSchemaMismatchError);
  });
  it("enforces streaming body limits and safe transport diagnostics", async () => {
    const oversized: typeof fetch = async () => new Response(new Uint8Array(5_000_001));
    await expect(
      new SteamClient(100, oversized).get("profile", steamFixtureId, apiKey)
    ).rejects.toBeInstanceOf(ProviderSchemaMismatchError);
    const failing: typeof fetch = async () => {
      throw new Error(`transport ${apiKey}`);
    };
    await expect(
      new SteamClient(100, failing).get("profile", steamFixtureId, apiKey)
    ).rejects.toBeInstanceOf(RetryableProviderError);
    await expect(
      new SteamClient(100, failing).get("profile", steamFixtureId, apiKey)
    ).rejects.not.toThrow(apiKey);
  });
  it("matches the language-neutral protocol machine schema", async () => {
    const { provider, input, normalized, projections } = await pipeline();
    const schema = JSON.parse(
      await readFile("docs/schemas/provider-data-protocol.v2.schema.json", "utf8")
    ) as object;
    const validate = addFormats(new Ajv2020({ strict: false, allErrors: true })).compile(schema);
    const collection = await provider.connector.collect(toProviderSyncRequest(run));
    for (const message of [
      provider.manifest,
      collection,
      ...collection.data.records,
      input,
      normalized,
      projections
    ])
      expect(validate(message), JSON.stringify(validate.errors)).toBe(true);
  });
});
