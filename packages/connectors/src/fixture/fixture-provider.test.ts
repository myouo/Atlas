import type { ProjectionTarget, ProviderFetchResult, RawSnapshot, SyncRun } from "@nivalis/domain";
import { PermanentProviderError, RetryableProviderError } from "@nivalis/domain";
import { describe, expect, it } from "vitest";

import { FixtureProviderRuntime } from "./fixture-provider";

describe("FixtureProviderRuntime", () => {
  it("exercises Connector -> Normalizer -> Projector without Provider HTTP", async () => {
    const runtime = new FixtureProviderRuntime();
    const fetched = await runtime.connector.fetch(run(1));
    const normalized = await runtime.normalizer.normalize([snapshot(fetched[0]!.payload)]);
    const projection = await runtime.projector.project(normalized, [neteaseTarget("7d")]);
    expect(projection[0]).toMatchObject({
      data: { plays: 267, range: "7d" },
      projectionKey: "key-7d"
    });
  });

  it("classifies retryable and permanent Fixture scenarios", async () => {
    const retrying = new FixtureProviderRuntime(() => "retry_then_success");
    await expect(retrying.connector.fetch(run(1))).rejects.toBeInstanceOf(RetryableProviderError);
    await expect(retrying.connector.fetch(run(3))).resolves.toMatchObject([{ schemaVersion: 1 }]);
    const permanent = new FixtureProviderRuntime(() => "permanent_failure");
    await expect(permanent.connector.fetch(run(1))).rejects.toBeInstanceOf(PermanentProviderError);
  });
});

function run(attemptCount: number): SyncRun {
  return {
    attemptCount,
    finishedAt: null,
    id: "00000000-0000-4000-8000-000000000500",
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "fixture",
    providerConnectionId: "00000000-0000-4000-8000-000000000400",
    queueJobId: null,
    requestedAt: new Date("2026-08-24T01:00:00.000Z"),
    startedAt: null,
    status: "running"
  };
}

function snapshot(payload: ProviderFetchResult["payload"]): RawSnapshot {
  const time = new Date("2026-08-24T01:00:00.000Z");
  return {
    createdAt: time,
    fetchedAt: time,
    id: "00000000-0000-4000-8000-000000000600",
    payload,
    payloadHash: "hash",
    provider: "fixture",
    providerConnectionId: "00000000-0000-4000-8000-000000000400",
    schemaVersion: 1,
    sourceKind: "fixture.dashboard",
    sourceCursor: null,
    sourceTimestamp: null,
    syncRunId: "00000000-0000-4000-8000-000000000500"
  };
}

function neteaseTarget(range: "7d" | "30d"): ProjectionTarget {
  return {
    dataConfig: { range },
    enabled: true,
    id: "00000000-0000-4000-8000-000000001006",
    presentationConfig: {},
    projectionKey: `key-${range}`,
    provider: "fixture",
    schemaVersion: 1,
    title: "网易云音乐",
    type: "music.netease.overview"
  };
}
