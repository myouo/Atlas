import {
  PROVIDER_JSON_MEDIA_TYPE,
  providerNormalizedSchemaId,
  providerProtocolMetadata,
  ProviderProtocolError,
  providerSourceSchemaId
} from "@nivalis/domain";
import type {
  ProviderCollection,
  ProviderRuntimeManifest,
  ProviderRuntimeModule,
  ProviderSourceRecord,
  ProviderSyncRequest,
  SyncRun
} from "@nivalis/domain";
import { describe, expect, it, vi } from "vitest";

import { collectProviderData } from "./provider-collection-service";

const run: SyncRun = {
  attemptCount: 1,
  finishedAt: null,
  id: "00000000-0000-4000-8000-000000000601",
  lastErrorCode: null,
  lastErrorMessage: null,
  provider: "fixture",
  providerConnectionId: "00000000-0000-4000-8000-000000000501",
  queueJobId: null,
  requestedAt: new Date("2026-09-04T00:00:00.000Z"),
  startedAt: new Date("2026-09-04T00:00:01.000Z"),
  status: "running"
};

const manifest: ProviderRuntimeManifest = {
  data: {
    capabilities: {
      collectionModes: ["snapshot"],
      continuation: true,
      partialResults: false,
      payloadKinds: ["json"]
    },
    displayName: "Paged Fixture",
    extensions: {},
    limits: {
      maxBatchBytes: 10_000,
      maxBatchRecords: 1,
      maxCacheRecords: 1,
      maxCheckpointBytes: 1_000,
      maxCollectionBytes: 20_000,
      maxContinuationBatches: 3,
      maxIssues: 4,
      maxNormalizedBytes: 10_000,
      maxProjectionBytes: 10_000,
      maxRecordBytes: 5_000
    },
    normalizedSchema: {
      acceptedVersions: [1],
      id: providerNormalizedSchemaId("fixture"),
      producedVersion: 1
    },
    sources: [
      {
        criticality: "required",
        dataShape: "collection",
        extensions: {},
        id: "fixture.items",
        mediaTypes: [PROVIDER_JSON_MEDIA_TYPE],
        operations: ["replace"],
        partitions: ["index"],
        payloadKinds: ["json"],
        schema: {
          acceptedVersions: [1],
          id: providerSourceSchemaId("fixture", "fixture.items"),
          producedVersion: 1
        }
      }
    ]
  },
  meta: providerProtocolMetadata("manifest", "fixture")
};

describe("Provider collection orchestration", () => {
  it("follows bounded continuation batches and forwards cache only once", async () => {
    const requests: ProviderSyncRequest[] = [];
    const connector = vi.fn(async (request: ProviderSyncRequest): Promise<ProviderCollection> => {
      requests.push(request);
      const index = request.data.continuation === null ? 0 : 1;
      return batch(index, index === 0 ? "page-2" : null);
    });
    const runtime = runtimeWith(connector);
    const cachedRecords = [record(9)];

    const result = await collectProviderData(runtime, run, { cachedRecords });

    expect(result.records.map((item) => item.meta.partition)).toEqual([
      { index: 0, kind: "index" },
      { index: 1, kind: "index" }
    ]);
    expect(result.checkpoint).toEqual({ page: 2 });
    expect(requests.map((request) => request.data.continuation)).toEqual([null, "page-2"]);
    expect(requests[0]!.data.cachedRecords).toEqual(cachedRecords);
    expect(requests[1]!.data.cachedRecords).toEqual([]);
    expect(requests[1]!.data.checkpoint).toEqual({ page: 1 });
  });

  it("rejects repeated continuation tokens before an unbounded loop", async () => {
    const runtime = runtimeWith(async () => batch(0, "same-page"));
    await expect(collectProviderData(runtime, run)).rejects.toBeInstanceOf(ProviderProtocolError);
  });
});

function runtimeWith(
  collect: ProviderRuntimeModule["connector"]["collect"]
): ProviderRuntimeModule {
  return {
    connector: { collect },
    manifest,
    normalizer: { normalize: async () => Promise.reject(new Error("not used")) },
    projector: { project: async () => Promise.reject(new Error("not used")) }
  };
}

function batch(index: number, continuation: string | null): ProviderCollection {
  return {
    data: {
      checkpoint: { page: index + 1 },
      continuation,
      issues: [],
      mode: "snapshot",
      outcome: "complete",
      records: [record(index)]
    },
    meta: providerProtocolMetadata("collection.result", "fixture", run.id)
  };
}

function record(index: number): ProviderSourceRecord {
  return {
    data: { id: String(index) },
    meta: {
      ...providerProtocolMetadata("source.record", "fixture", run.id),
      collectedAt: "2026-09-04T00:00:02.000Z",
      mediaType: PROVIDER_JSON_MEDIA_TYPE,
      operation: "replace",
      partition: { index, kind: "index" },
      payloadKind: "json",
      schemaId: providerSourceSchemaId("fixture", "fixture.items"),
      schemaVersion: 1,
      source: "fixture.items",
      sourceUpdatedAt: null
    }
  };
}
