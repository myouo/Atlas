import { describe, expect, it } from "vitest";

import { ProviderProtocolError } from "./errors";
import {
  encodeProviderSourceContext,
  PROVIDER_JSON_MEDIA_TYPE,
  providerDataEnvelope,
  providerProtocolMetadata,
  providerSourceSchemaId,
  toProviderSnapshotRecord
} from "./provider-protocol";
import type { ProviderCollectionData, ProviderSourceRecord } from "./provider-protocol";
import type { RawSnapshot } from "./sync";

const record: ProviderSourceRecord = {
  data: [{ id: "item-1" }],
  meta: {
    ...providerProtocolMetadata("source.record", "netease", "run-1"),
    collectedAt: "2026-09-04T00:00:00.000Z",
    extensions: { "netease.page-kind": "followers" },
    mediaType: PROVIDER_JSON_MEDIA_TYPE,
    operation: "upsert",
    partition: { cursor: "page-2", index: 1, kind: "cursor" },
    payloadKind: "json",
    schemaId: providerSourceSchemaId("netease", "netease.followers"),
    schemaVersion: 2,
    source: "netease.followers",
    sourceUpdatedAt: null
  }
};

const collection: ProviderCollectionData = {
  checkpoint: { sequence: "42" },
  continuation: null,
  issues: [],
  mode: "incremental",
  outcome: "complete",
  records: [record]
};

describe("Provider protocol Raw Snapshot bridge", () => {
  it("constructs typed envelopes with non-overridable core metadata", () => {
    const envelope = providerDataEnvelope("projection.result", "fixture", "run-1", [], {
      issues: [],
      outcome: "complete" as const
    });
    expect(envelope).toEqual({
      data: [],
      meta: {
        correlationId: "run-1",
        extensions: {},
        issues: [],
        kind: "projection.result",
        outcome: "complete",
        protocol: "nivalis.provider-data",
        protocolVersion: "2.0",
        provider: "fixture"
      }
    });
  });

  it("round-trips source, partition, operation, checkpoint, and schema metadata", () => {
    const snapshot = toProviderSnapshotRecord(raw(encodeProviderSourceContext(record, collection)));
    expect(snapshot).toMatchObject({
      data: record.data,
      meta: {
        checkpoint: { sequence: "42" },
        collectionMode: "incremental",
        extensions: { "netease.page-kind": "followers" },
        operation: "upsert",
        partition: { cursor: "page-2", index: 1, kind: "cursor" },
        schemaId: record.meta.schemaId,
        schemaVersion: 2,
        source: "netease.followers"
      }
    });
  });

  it("decodes protocol-1 page suffixes into stable v2 source partitions", () => {
    const snapshot = toProviderSnapshotRecord(raw(null, "netease.followers.page.3", 1));
    expect(snapshot.meta).toMatchObject({
      collectionMode: "snapshot",
      operation: "replace",
      partition: { index: 3, kind: "index" },
      schemaId: providerSourceSchemaId("netease", "netease.followers"),
      source: "netease.followers"
    });
  });

  it("fails closed for damaged protocol-2 storage context", () => {
    expect(() => toProviderSnapshotRecord(raw("nivalis.provider-data/2:{broken"))).toThrow(
      ProviderProtocolError
    );
  });
});

function raw(
  sourceCursor: string | null,
  sourceKind = record.meta.source,
  schemaVersion = record.meta.schemaVersion
): RawSnapshot {
  return {
    createdAt: new Date("2026-09-04T00:00:01.000Z"),
    fetchedAt: new Date(record.meta.collectedAt),
    id: "snapshot-1",
    payload: record.data,
    payloadHash: "a".repeat(64),
    provider: "netease",
    providerConnectionId: "connection-1",
    schemaVersion,
    sourceCursor,
    sourceKind,
    sourceTimestamp: null,
    syncRunId: "run-1"
  };
}
