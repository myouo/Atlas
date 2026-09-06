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
  fetcher = createSteamFixtureFetcher(scenario),
  reference = steamFixtureId
) {
  return new SteamProviderRuntime(
    { resolve: async () => JSON.stringify({ apiKey, steamId: reference }) },
    { timeoutMs: 100 },
    fetcher
  );
}
async function pipeline(
  scenario: SteamFixtureScenario = "normal",
  fetcher = createSteamFixtureFetcher(scenario)
) {
  const provider = runtime(scenario, fetcher);
  assertProviderManifest(provider.manifest, "steam");
  const collection = await collectProviderData(provider, run);
  const records = collection.records.map((record, index) =>
    toProviderSnapshotRecord({
      id: `00000000-0000-4000-8000-00000000091${index}`,
      provider: "steam",
      providerConnectionId: run.providerConnectionId,
      syncRunId: run.id,
      sourceKind: record.meta.source,
      schemaVersion: record.meta.schemaVersion,
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
  it.each([
    "fixture_user",
    "https://steamcommunity.com/id/fixture_user/",
    `https://steamcommunity.com/profiles/${steamFixtureId}/`,
    "39734273"
  ])("resolves supported account input before collection: %s", async (reference) => {
    const fetcher = vi.fn(createSteamFixtureFetcher());
    const result = await runtime("normal", fetcher, reference).connector.collect(
      toProviderSyncRequest(run)
    );
    expect(
      result.data.records.find((record) => record.meta.source === "steam.profile")?.data
    ).toMatchObject({ steamid: steamFixtureId });
    for (const [input, init] of fetcher.mock.calls) {
      expect(new URL(String(input)).origin).toBe("https://api.steampowered.com");
      expect(String(input)).not.toContain(apiKey);
      expect(new Headers(init?.headers).get("x-webapi-key")).toBe(apiKey);
    }
  });
  it("reports an unresolved vanity account without fetching unrelated profiles", async () => {
    const fetcher = vi.fn(async () => Response.json({ response: { success: 42 } }));
    await expect(
      runtime("normal", fetcher, "missing_user").connector.collect(toProviderSyncRequest(run))
    ).rejects.toBeInstanceOf(ProviderCredentialError);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("collects replayable evidence, normalizes minutes and emits only selected public fields", async () => {
    const { collection, normalized, projections, provider, input } = await pipeline();
    expect(collection.records).toHaveLength(6);
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
      expect(init?.redirect).toBe("manual");
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
  it("rejects redirects without forwarding a credential to another host", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://example.invalid/" } })
    );
    await expect(
      new SteamClient(100, fetcher).get("profile", steamFixtureId, apiKey)
    ).rejects.toThrow("redirects are not allowed");
    expect(fetcher).toHaveBeenCalledOnce();
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

  it("keeps all recent games, richer library fields and exact coverage independently of public limits", async () => {
    const real = createSteamFixtureFetcher();
    const games = Array.from({ length: 35 }, (_, index) => ({
      appid: index + 1,
      ...(index === 34 ? {} : { name: `Game ${index + 1}` }),
      playtime_forever: index,
      playtime_2weeks: index,
      rtime_last_played: 1700000000,
      playtime_windows_forever: index,
      has_community_visible_stats: true
    }));
    let active = 0;
    let maxActive = 0;
    let achievementRequests = 0;
    const fetched: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (url.pathname.includes("GetRecentlyPlayedGames")) {
          expect(JSON.parse(url.searchParams.get("input_json")!).count).toBe(0);
          return Response.json({ response: { total_count: games.length, games } });
        }
        if (url.pathname.includes("GetOwnedGames"))
          return Response.json({ response: { game_count: games.length, games } });
        if (url.pathname.includes("GetPlayerAchievements")) achievementRequests++;
        return await real(input, init);
      } finally {
        active--;
      }
    };
    const { normalized, projections } = await pipeline("normal", fetched);
    expect(normalized.meta.schemaVersion).toBe(2);
    expect(normalized.data).toMatchObject({
      accountDetails: { createdAt: "2014-05-13T16:53:20.000Z", currentGame: { gameId: "10" } },
      library: {
        gameCount: 35,
        unplayedGameCount: 1,
        games: expect.arrayContaining([
          expect.objectContaining({ appId: 35, name: "Steam App 35", nameSource: "app_id" })
        ])
      },
      badges: { playerXp: 1500, items: [{ badgeId: 1 }] },
      coverage: {
        library: { status: "complete", collectedCount: 35, reportedCount: 35 },
        recentGames: { status: "complete", collectedCount: 35, reportedCount: 35 },
        achievements: { status: "partial", collectedCount: 8, reportedCount: 35 }
      }
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(achievementRequests).toBe(8);
    const data = projections.data[0]!.data as { recentGames: { items: unknown[] } };
    expect(data.recentGames.items).toHaveLength(6);
    expect(JSON.stringify(projections)).not.toContain("platformPlaytimeMinutes");
    expect(JSON.stringify(projections)).not.toContain("accountDetails");
    expect(JSON.stringify(projections)).not.toContain("FIRST_STEP");
  });

  it("keeps partial achievement failures explicit without failing the core catalog", async () => {
    const real = createSteamFixtureFetcher();
    const fetched: typeof fetch = async (input, init) =>
      String(input).includes("GetPlayerAchievements")
        ? new Response("Rate limited", { status: 429 })
        : real(input, init);
    const { normalized, collection } = await pipeline("normal", fetched);
    expect(collection.outcome).toBe("partial");
    expect(normalized.data).toMatchObject({
      library: { gameCount: 2 },
      achievements: {
        games: [
          { availability: "unavailable", reason: "temporarily_unavailable" },
          { availability: "unavailable" }
        ]
      },
      coverage: { achievements: { status: "partial", collectedCount: 0, reportedCount: 2 } }
    });
  });

  it("replays legacy limited evidence without claiming full coverage or inventing new fields", async () => {
    const { provider, input } = await pipeline();
    const legacy: ProviderNormalizationInput = {
      ...input,
      data: {
        ...input.data,
        records: input.data.records
          .filter((record) => !["steam.badges", "steam.achievements"].includes(record.meta.source))
          .map((record) =>
            record.meta.source === "steam.recent"
              ? {
                  ...record,
                  meta: { ...record.meta, schemaVersion: 1 },
                  data: {
                    total_count: 30,
                    games: Array.from({ length: 20 }, (_, index) => ({
                      appid: index + 1,
                      name: `Game ${index}`,
                      img_icon_url: null,
                      playtime_forever: null,
                      playtime_2weeks: null
                    }))
                  }
                }
              : record
          )
      }
    };
    const replay = await provider.normalizer.normalize(legacy);
    expect(replay.data).toMatchObject({
      coverage: {
        recentGames: { status: "partial", reportedCount: 30, collectedCount: 20 },
        badges: { status: "unavailable", reason: "not_synced" },
        achievements: { status: "not_collected" }
      }
    });
  });
});
