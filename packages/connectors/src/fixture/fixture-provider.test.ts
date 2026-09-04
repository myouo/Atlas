import type { JsonValue, ProjectionTarget, RawSnapshot, SyncRun } from "@nivalis/domain";
import {
  PermanentProviderError,
  providerProtocolMetadata,
  RetryableProviderError,
  toProviderSyncRequest,
  toProviderSnapshotRecord
} from "@nivalis/domain";
import { describe, expect, it } from "vitest";

import { FixtureProviderRuntime } from "./fixture-provider";

describe("FixtureProviderRuntime", () => {
  it("exercises Connector -> Normalizer -> Projector without Provider HTTP", async () => {
    const runtime = new FixtureProviderRuntime();
    const collected = await runtime.connector.collect(request(1));
    const records = [toProviderSnapshotRecord(snapshot(collected.data.records[0]!.data))];
    const normalized = await runtime.normalizer.normalize({
      data: {
        checkpoint: collected.data.checkpoint,
        collectionMode: collected.data.mode,
        collectionOutcome: collected.data.outcome,
        issues: collected.data.issues,
        previous: null,
        records
      },
      meta: providerProtocolMetadata("normalization.request", "fixture", run(1).id)
    });
    const projection = await runtime.projector.project({
      data: { normalized, targets: [neteaseTarget("7d")] },
      meta: providerProtocolMetadata("projection.request", "fixture", run(1).id)
    });
    expect(projection.data[0]).toMatchObject({
      data: { plays: 267, range: "7d" },
      projectionKey: "key-7d"
    });
    expect(collected.meta).toEqual(
      providerProtocolMetadata("collection.result", "fixture", run(1).id)
    );
  });

  it("classifies retryable and permanent Fixture scenarios", async () => {
    const retrying = new FixtureProviderRuntime(() => "retry_then_success");
    await expect(retrying.connector.collect(request(1))).rejects.toBeInstanceOf(
      RetryableProviderError
    );
    await expect(retrying.connector.collect(request(3))).resolves.toMatchObject({
      data: { records: [{ meta: { schemaVersion: 1 } }] }
    });
    const permanent = new FixtureProviderRuntime(() => "permanent_failure");
    await expect(permanent.connector.collect(request(1))).rejects.toBeInstanceOf(
      PermanentProviderError
    );
  });
});

function request(attempt: number) {
  return toProviderSyncRequest(run(attempt));
}

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

function snapshot(payload: JsonValue): RawSnapshot {
  const time = new Date("2026-08-24T01:00:00.000Z");
  return {
    createdAt: time,
    fetchedAt: time,
    id: "00000000-0000-4000-8000-000000000600",
    payload,
    payloadHash: "a".repeat(64),
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
