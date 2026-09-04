import {
  PROVIDER_BLOB_REFERENCE_MEDIA_TYPE,
  PROVIDER_JSON_MEDIA_TYPE,
  providerNormalizedSchemaId,
  providerProtocolMetadata,
  ProviderProtocolError,
  providerSourceSchemaId
} from "@nivalis/domain";
import type {
  NormalizedProviderData,
  ProviderCollection,
  ProviderFailure,
  ProviderNormalizationInput,
  ProviderRuntimeManifest,
  ProviderSnapshotRecord,
  ProviderSourceRecord
} from "@nivalis/domain";
import { describe, expect, it } from "vitest";

import {
  assertNormalizedProviderData,
  assertProviderCollection,
  assertProviderManifest,
  assertProviderNormalizationInput,
  assertProviderProjectionBatch,
  assertProviderSnapshotRecords,
  PROVIDER_HOST_LIMITS,
  unwrapProviderResult
} from "./provider-protocol-validation";

const correlationId = "00000000-0000-4000-8000-000000000601";
const accountSource = "netease.account";

const manifest: ProviderRuntimeManifest = {
  data: {
    capabilities: {
      collectionModes: ["snapshot", "incremental"],
      continuation: true,
      partialResults: true,
      payloadKinds: ["json", "blob_reference"]
    },
    displayName: "NetEase test adapter",
    extensions: {},
    limits: {
      maxBatchBytes: 100_000,
      maxBatchRecords: 10,
      maxCacheRecords: 3,
      maxCheckpointBytes: 1_000,
      maxCollectionBytes: 100_000,
      maxContinuationBatches: 4,
      maxIssues: 10,
      maxNormalizedBytes: 100_000,
      maxProjectionBytes: 100_000,
      maxRecordBytes: 50_000
    },
    normalizedSchema: {
      acceptedVersions: [1, 2],
      id: providerNormalizedSchemaId("netease"),
      producedVersion: 2
    },
    sources: [
      {
        criticality: "required",
        dataShape: "document",
        extensions: {},
        id: accountSource,
        mediaTypes: [PROVIDER_JSON_MEDIA_TYPE, PROVIDER_BLOB_REFERENCE_MEDIA_TYPE],
        operations: ["replace", "upsert", "delete"],
        partitions: ["singleton", "key", "cursor"],
        payloadKinds: ["json", "blob_reference"],
        schema: {
          acceptedVersions: [1, 2],
          id: providerSourceSchemaId("netease", accountSource),
          producedVersion: 2
        }
      }
    ]
  },
  meta: providerProtocolMetadata("manifest", "netease")
};

const record: ProviderSourceRecord = {
  data: { account: { id: "10001" }, code: 200 },
  meta: {
    ...providerProtocolMetadata("source.record", "netease", correlationId),
    collectedAt: "2026-09-04T00:00:00.000Z",
    mediaType: PROVIDER_JSON_MEDIA_TYPE,
    operation: "replace",
    partition: { kind: "singleton" },
    payloadKind: "json",
    schemaId: providerSourceSchemaId("netease", accountSource),
    schemaVersion: 2,
    source: accountSource,
    sourceUpdatedAt: null
  }
};

const collection: ProviderCollection = {
  data: {
    checkpoint: { revision: "2026-09-04" },
    continuation: null,
    issues: [],
    mode: "snapshot",
    outcome: "complete",
    records: [record]
  },
  meta: providerProtocolMetadata("collection.result", "netease", correlationId)
};

const snapshot: ProviderSnapshotRecord = {
  data: record.data,
  meta: {
    ...providerProtocolMetadata("snapshot.record", "netease", correlationId),
    checkpoint: collection.data.checkpoint,
    collectedAt: record.meta.collectedAt,
    collectionMode: collection.data.mode,
    collectionOutcome: collection.data.outcome,
    connectionId: "connection-1",
    issues: collection.data.issues,
    mediaType: record.meta.mediaType,
    operation: record.meta.operation,
    partition: record.meta.partition,
    payloadHash: "a".repeat(64),
    payloadKind: record.meta.payloadKind,
    runId: correlationId,
    schemaId: record.meta.schemaId,
    schemaVersion: record.meta.schemaVersion,
    snapshotId: "snapshot-1",
    source: record.meta.source,
    sourceUpdatedAt: record.meta.sourceUpdatedAt,
    storedAt: "2026-09-04T00:00:01.000Z"
  }
};

function normalized(
  overrides: Partial<NormalizedProviderData["meta"]> = {}
): NormalizedProviderData {
  return {
    data: { account: { providerUserId: "10001" } },
    meta: {
      ...providerProtocolMetadata("normalization.result", "netease", correlationId),
      checkpoint: collection.data.checkpoint,
      issues: [],
      outcome: "complete",
      schemaId: providerNormalizedSchemaId("netease"),
      schemaVersion: 2,
      sourceSnapshots: [
        {
          partition: snapshot.meta.partition,
          snapshotId: snapshot.meta.snapshotId,
          source: accountSource
        }
      ],
      ...overrides
    }
  };
}

function normalizationInput(
  previous: NormalizedProviderData | null = null,
  records: readonly ProviderSnapshotRecord[] = [snapshot]
): ProviderNormalizationInput {
  return {
    data: {
      checkpoint: collection.data.checkpoint,
      collectionMode: collection.data.mode,
      collectionOutcome: collection.data.outcome,
      issues: collection.data.issues,
      previous,
      records
    },
    meta: providerProtocolMetadata("normalization.request", "netease", correlationId)
  };
}

describe("Provider Data Protocol 2.0 validation", () => {
  it("accepts a canonical manifest, collection, snapshot, normalized result, and projection", () => {
    expect(() => assertProviderManifest(manifest, "netease")).not.toThrow();
    expect(() => assertProviderCollection(collection, manifest, correlationId)).not.toThrow();
    expect(() => assertProviderSnapshotRecords([snapshot], manifest, correlationId)).not.toThrow();
    const value = normalized();
    expect(() =>
      assertNormalizedProviderData(value, manifest, normalizationInput(), correlationId)
    ).not.toThrow();
    expect(() =>
      assertProviderProjectionBatch(
        {
          data: [
            {
              data: { displayName: "Fixture" },
              projectionKey: "a".repeat(64),
              projectionSchemaVersion: 1,
              widgetId: "widget-1"
            }
          ],
          meta: {
            ...providerProtocolMetadata("projection.result", "netease", correlationId),
            issues: [],
            outcome: "complete"
          }
        },
        manifest,
        correlationId
      )
    ).not.toThrow();
  });

  it("does not let an adapter raise its own host resource ceiling", () => {
    const oversized: ProviderRuntimeManifest = {
      ...manifest,
      data: {
        ...manifest.data,
        limits: {
          ...manifest.data.limits,
          maxCollectionBytes: PROVIDER_HOST_LIMITS.maxCollectionBytes + 1
        }
      }
    };
    expect(() => assertProviderManifest(oversized, "netease")).toThrow(ProviderProtocolError);
  });

  it("accepts namespaced extensions and rejects ad-hoc core metadata", () => {
    const extended: ProviderCollection = {
      ...collection,
      data: {
        ...collection.data,
        records: [
          {
            ...record,
            meta: {
              ...record.meta,
              extensions: { "netease.transport-profile": "android" }
            }
          }
        ]
      }
    };
    expect(() => assertProviderCollection(extended, manifest, correlationId)).not.toThrow();
    const adHoc = Object.assign({}, extended, {
      data: Object.assign({}, extended.data, {
        ...extended.data,
        records: [
          {
            ...extended.data.records[0]!,
            meta: { ...extended.data.records[0]!.meta, transportProfile: "android" }
          }
        ]
      })
    });
    expect(() => assertProviderCollection(adHoc, manifest, correlationId)).toThrow(
      ProviderProtocolError
    );
  });

  it.each([
    ["wrong protocol kind", { kind: "projection.result" }],
    ["wrong Provider", { provider: "steam" }],
    ["non-canonical timestamp", { collectedAt: "2026-09-04T08:00:00+08:00" }],
    ["unscoped source", { source: "account" }],
    ["wrong schema id", { schemaId: "urn:test:wrong" }],
    ["wrong produced version", { schemaVersion: 1 }],
    ["undeclared partition", { partition: { index: 0, kind: "index" } }]
  ])("rejects %s at the fresh collection boundary", (_label, override) => {
    const candidate: ProviderCollection = {
      ...collection,
      data: {
        ...collection.data,
        records: [{ ...record, meta: { ...record.meta, ...override } } as ProviderSourceRecord]
      }
    };
    expect(() => assertProviderCollection(candidate, manifest, correlationId)).toThrow(
      ProviderProtocolError
    );
  });

  it("accepts historical source versions for replay but never emits them as current", () => {
    const historical: ProviderSnapshotRecord = {
      ...snapshot,
      meta: { ...snapshot.meta, schemaVersion: 1 }
    };
    expect(() =>
      assertProviderSnapshotRecords([historical], manifest, correlationId)
    ).not.toThrow();
    const staleCollection: ProviderCollection = {
      ...collection,
      data: {
        ...collection.data,
        records: [{ ...record, meta: { ...record.meta, schemaVersion: 1 } }]
      }
    };
    expect(() => assertProviderCollection(staleCollection, manifest, correlationId)).toThrow(
      ProviderProtocolError
    );
  });

  it("supports explicit partial results and requires a safe explanation", () => {
    const partial: ProviderCollection = {
      ...collection,
      data: {
        ...collection.data,
        issues: [
          {
            code: "optional-source-unavailable",
            message: "An optional source was unavailable.",
            partition: null,
            retryable: false,
            severity: "warning",
            source: null
          }
        ],
        outcome: "partial"
      }
    };
    expect(() => assertProviderCollection(partial, manifest, correlationId)).not.toThrow();
    expect(() =>
      assertProviderCollection(
        { ...partial, data: { ...partial.data, issues: [] } },
        manifest,
        correlationId
      )
    ).toThrow(ProviderProtocolError);
  });

  it("supports checkpointed incremental upserts and tombstones", () => {
    for (const incrementalRecord of [
      { ...record, meta: { ...record.meta, operation: "upsert" as const } },
      { data: null, meta: { ...record.meta, operation: "delete" as const } }
    ]) {
      const incremental: ProviderCollection = {
        ...collection,
        data: {
          ...collection.data,
          checkpoint: { sequence: "9007199254740993" },
          mode: "incremental",
          records: [incrementalRecord]
        }
      };
      expect(() => assertProviderCollection(incremental, manifest, correlationId)).not.toThrow();
    }
  });

  it("allows a no-op incremental batch to carry prior materialized state forward", () => {
    const previous = normalized({ checkpoint: { sequence: "1" } });
    const input: ProviderNormalizationInput = {
      data: {
        checkpoint: { sequence: "2" },
        collectionMode: "incremental",
        collectionOutcome: "complete",
        issues: [],
        previous,
        records: []
      },
      meta: providerProtocolMetadata("normalization.request", "netease", correlationId)
    };
    const result = normalized({
      checkpoint: { sequence: "2" },
      sourceSnapshots: previous.meta.sourceSnapshots
    });
    expect(() => assertProviderNormalizationInput(input, manifest, correlationId)).not.toThrow();
    expect(() =>
      assertNormalizedProviderData(result, manifest, input, correlationId)
    ).not.toThrow();
  });

  it("supports immutable Blob references without embedding binary data", () => {
    const blob: ProviderSourceRecord = {
      data: {
        byteLength: 1234,
        fileName: "cover.webp",
        kind: "blob_reference",
        mediaType: "image/webp",
        sha256: "b".repeat(64),
        storageKey: "providers/netease/covers/cover.webp"
      },
      meta: {
        ...record.meta,
        mediaType: PROVIDER_BLOB_REFERENCE_MEDIA_TYPE,
        partition: { key: "cover", kind: "key" },
        payloadKind: "blob_reference"
      }
    };
    const value: ProviderCollection = {
      ...collection,
      data: { ...collection.data, records: [blob] }
    };
    expect(() => assertProviderCollection(value, manifest, correlationId)).not.toThrow();
  });

  it.each([
    ["scalar", "9223372036854775807"],
    ["document", { id: "item-1", name: "Document" }],
    ["collection", [{ id: "item-1" }, { id: "item-2" }]],
    ["time_series", [{ at: "2026-09-04T00:00:00.000Z", value: 3.5 }]],
    ["graph", { edges: [{ from: "a", to: "b" }], nodes: [{ id: "a" }, { id: "b" }] }],
    ["media", { height: 1080, mediaType: "image/webp", width: 1920 }],
    ["mixed", null]
  ] as const)("accepts declared %s data", (dataShape, data) => {
    const shapedManifest: ProviderRuntimeManifest = {
      ...manifest,
      data: {
        ...manifest.data,
        sources: [{ ...manifest.data.sources[0]!, dataShape }]
      }
    };
    const shapedCollection: ProviderCollection = {
      ...collection,
      data: { ...collection.data, records: [{ ...record, data }] }
    };
    expect(() =>
      assertProviderCollection(shapedCollection, shapedManifest, correlationId)
    ).not.toThrow();
  });

  it.each([
    { kind: "singleton" },
    { index: 2, kind: "index" },
    { cursor: "next-page", index: 3, kind: "cursor" },
    { key: "repository-42", kind: "key" },
    {
      end: "2026-09-05T00:00:00.000Z",
      kind: "time_window",
      start: "2026-09-04T00:00:00.000Z"
    }
  ] as const)("accepts declared $kind partitions", (partition) => {
    const partitionedManifest: ProviderRuntimeManifest = {
      ...manifest,
      data: {
        ...manifest.data,
        sources: [
          {
            ...manifest.data.sources[0]!,
            partitions: ["singleton", "index", "cursor", "key", "time_window"]
          }
        ]
      }
    };
    const value: ProviderCollection = {
      ...collection,
      data: { ...collection.data, records: [{ ...record, meta: { ...record.meta, partition } }] }
    };
    expect(() => assertProviderCollection(value, partitionedManifest, correlationId)).not.toThrow();
  });

  it("rejects unsafe integers, cyclic values, and credential-bearing metadata", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const data of [Number.MAX_SAFE_INTEGER + 1, cyclic]) {
      const invalid = {
        ...collection,
        data: { ...collection.data, records: [{ ...record, data }] }
      } as ProviderCollection;
      expect(() => assertProviderCollection(invalid, manifest, correlationId)).toThrow(
        ProviderProtocolError
      );
    }
    const unsafeCursor: ProviderCollection = {
      ...collection,
      data: {
        ...collection.data,
        records: [
          {
            ...record,
            meta: {
              ...record.meta,
              partition: { cursor: "access_token=private", index: 0, kind: "cursor" }
            }
          }
        ]
      }
    };
    expect(() => assertProviderCollection(unsafeCursor, manifest, correlationId)).toThrow(
      ProviderProtocolError
    );
  });

  it("requires normalized lineage to match source and partition exactly", () => {
    expect(() =>
      assertNormalizedProviderData(
        normalized({
          sourceSnapshots: [
            {
              partition: { key: "wrong", kind: "key" },
              snapshotId: "snapshot-1",
              source: accountSource
            }
          ]
        }),
        manifest,
        normalizationInput(),
        correlationId
      )
    ).toThrow(ProviderProtocolError);
  });

  it("maps a wire-safe failure envelope back to the application error taxonomy", () => {
    const failure: ProviderFailure = {
      data: {
        category: "rate_limit",
        code: "provider-rate-limited",
        credentialStatus: null,
        message: "The Provider asked the client to retry later.",
        partition: null,
        retryable: true,
        retryAfterMs: 1_000,
        source: accountSource
      },
      meta: providerProtocolMetadata("failure", "netease", correlationId)
    };
    expect(() => unwrapProviderResult(failure, manifest, correlationId)).toThrowError(
      expect.objectContaining({
        code: "retryable-provider-error",
        retryable: true,
        retryAfterMs: 1_000
      })
    );
  });
});
