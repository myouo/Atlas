# Nivalis Provider Data Protocol 2.0

Status: Accepted  
Protocol: `nivalis.provider-data`  
Version: `2.0`  
Machine contract: [`provider-data-protocol.v2.schema.json`](schemas/provider-data-protocol.v2.schema.json)

## Scope

This protocol is the sole data boundary between Nivalis synchronization and a third-party Provider
adapter. It covers discovery, collection, replayable evidence, normalization, and Widget
projection. It is independent from the public REST/OpenAPI contract and from interactive credential
acquisition.

The protocol standardizes lifecycle and evidence, not Provider business meaning. Git commits,
music listening, animation collections, game achievements, graphs, and media metadata retain their
truthful Provider-specific schemas. A universal nullable “activity” model is explicitly forbidden.

## Design invariants

1. Every message is a JSON-safe `{ data, meta }` envelope.
2. `meta.kind` discriminates the message before its payload is interpreted.
3. Every operation message carries a SyncRun `correlationId`; a static manifest carries `null`.
4. Protocol, source schema, normalized schema, and Widget schema versions evolve independently.
5. New data is emitted at one version while historical versions remain explicitly readable.
6. Source identifiers describe stable semantics; partition metadata identifies pages, keys, or
   windows. Instance numbers never alter the source identifier.
7. Collection is bounded by declared record, byte, cache, issue, and continuation limits.
8. Partial data, checkpoints, incremental operations, and failures are explicit—not inferred from
   missing fields.
9. Binary content is referenced from managed ObjectStorage and never embedded as base64.
10. Credentials are forbidden in payloads, extensions, checkpoints, cursors, errors, and persisted
    evidence.

## Common envelope

```json
{
  "data": {},
  "meta": {
    "correlationId": "00000000-0000-4000-8000-000000000601",
    "extensions": {},
    "kind": "collection.result",
    "protocol": "nivalis.provider-data",
    "protocolVersion": "2.0",
    "provider": "netease"
  }
}
```

The only top-level fields are `data` and `meta`. Optional protocol evolution happens inside a
namespaced `extensions` object, for example `{"netease.client-profile": "android"}`. Consumers
must ignore extensions they do not understand. An extension must never weaken a core invariant.
TypeScript adapters should construct messages with `providerDataEnvelope`; direct object literals
remain valid for other languages and are checked against the same JSON Schema/runtime rules.
Source-record extensions are retained with Raw evidence so replay observes the same metadata.

All protocol timestamps use canonical RFC 3339 UTC with milliseconds:
`2026-09-04T00:00:00.000Z`.

## Runtime manifest

The runtime publishes a `manifest` envelope before Nivalis accepts any operation:

```json
{
  "data": {
    "capabilities": {
      "collectionModes": ["snapshot"],
      "continuation": false,
      "partialResults": false,
      "payloadKinds": ["json"]
    },
    "displayName": "NetEase Cloud Music",
    "extensions": {},
    "limits": {
      "maxBatchBytes": 16000000,
      "maxBatchRecords": 128,
      "maxCacheRecords": 16,
      "maxCheckpointBytes": 16384,
      "maxCollectionBytes": 32000000,
      "maxContinuationBatches": 1,
      "maxIssues": 64,
      "maxNormalizedBytes": 16000000,
      "maxProjectionBytes": 16000000,
      "maxRecordBytes": 5000000
    },
    "normalizedSchema": {
      "acceptedVersions": [1],
      "id": "urn:nivalis:provider:netease:normalized",
      "producedVersion": 1
    },
    "sources": []
  },
  "meta": {
    "correlationId": null,
    "extensions": {},
    "kind": "manifest",
    "protocol": "nivalis.provider-data",
    "protocolVersion": "2.0",
    "provider": "netease"
  }
}
```

Each source declaration contains:

- `id`: stable Provider-namespaced semantics such as `netease.followers`;
- `criticality`: whether a complete result must include the source;
- `dataShape`: `scalar`, `document`, `collection`, `time_series`, `graph`, `media`, or `mixed`;
- `schema.id`, `schema.producedVersion`, and `schema.acceptedVersions`;
- allowed `partitions`, `operations`, `payloadKinds`, and media types;
- namespaced extensions.

The host rejects undeclared capabilities and values before persistence.
Adapter-declared limits may be lower than the Nivalis host ceilings but never higher, so an
untrusted manifest cannot grant itself unbounded Worker memory or processing scope.

## Schema evolution and replay

Schema production and consumption are deliberately separate:

```json
{
  "id": "urn:nivalis:provider:example:source:example.items",
  "producedVersion": 3,
  "acceptedVersions": [1, 2, 3]
}
```

Fresh collection must emit version `3`. Replay may read versions `1`, `2`, or `3`. Removing an
accepted version is an explicit loss of replay support and requires a migration/retention decision;
it is never an accidental side effect of advancing the current schema.

Protocol `2.x` may add optional, ignorable namespaced extensions. Changing required fields,
nullability, core semantics, or security rules requires a new protocol major version.

## Source records and general data forms

A collected source response is itself a `source.record` envelope:

```json
{
  "data": [{ "providerUserId": "10001", "displayName": "Example" }],
  "meta": {
    "collectedAt": "2026-09-04T00:00:00.000Z",
    "correlationId": "00000000-0000-4000-8000-000000000601",
    "extensions": {},
    "kind": "source.record",
    "mediaType": "application/json",
    "operation": "replace",
    "partition": { "index": 0, "kind": "index" },
    "payloadKind": "json",
    "protocol": "nivalis.provider-data",
    "protocolVersion": "2.0",
    "provider": "netease",
    "schemaId": "urn:nivalis:provider:netease:source:netease.followers",
    "schemaVersion": 1,
    "source": "netease.followers",
    "sourceUpdatedAt": null
  }
}
```

The JSON payload can represent:

| Form             | Representation                                         |
| ---------------- | ------------------------------------------------------ |
| Scalar           | JSON string, boolean, finite number, or null           |
| Document         | Provider-specific object                               |
| Collection/table | Array or object containing rows and coverage metadata  |
| Time series      | Ordered points plus an `index`/`time_window` partition |
| Graph            | Nodes/edges or Provider-native graph object            |
| Geo data         | GeoJSON or another declared source schema              |
| Mixed aggregate  | Explicit Provider-specific object/array union          |
| Binary/media     | Immutable `blob_reference` object                      |

JSON integer values must be within the interoperable safe-integer range. Larger integers, decimal
identifiers, currency quantities, and arbitrary-precision values are strings in the Provider schema;
adapters must not parse them through a lossy JavaScript number.

### Partitions

Partitions identify one record within a stable source:

- `singleton`: one complete document;
- `index`: deterministic zero-based segment;
- `cursor`: bounded Provider cursor plus a stable index;
- `key`: logical shard/resource key;
- `time_window`: half-open UTC window `[start, end)`.

The identity of a record is canonical `(source, partition kind/index/key/window)`; an opaque cursor
is traversal state and does not change the stable identity of its indexed page. NetEase legacy `.page.N` and
`.period.N` Raw Snapshot names are decoded into this model during replay, but new records never
encode instances into `source`.

### Payload kinds

`json` carries a normal JSON value. `blob_reference` carries only:

```json
{
  "byteLength": 1234,
  "fileName": "cover.webp",
  "kind": "blob_reference",
  "mediaType": "image/webp",
  "sha256": "<64 lower-case hex characters>",
  "storageKey": "providers/example/covers/cover.webp"
}
```

The storage key is logical and non-secret. Expiring vendor URLs, authorization headers, and raw
bytes are not Blob references.

## Collection, pagination, and partial results

`collection.request` contains the connection/SyncRun context, optional prior checkpoint, bounded
cache records, and an optional continuation token. `collection.result` contains:

```json
{
  "checkpoint": { "revision": "opaque-non-secret-value" },
  "continuation": null,
  "issues": [],
  "mode": "snapshot",
  "outcome": "complete",
  "records": []
}
```

Nivalis repeatedly calls the adapter while `continuation` is non-null. It detects repeated tokens,
enforces the manifest batch limit, forwards cache records only on the first call, and passes each
returned checkpoint into the next request.

`outcome: partial` requires manifest support and at least one safe structured issue. A partial batch
may omit required sources; a complete final result may not. Issues contain only code, safe message,
severity, retryability, and optional source—never raw Provider responses.

## Snapshot and incremental modes

Snapshot mode uses `replace` records and produces a self-contained current view. Incremental mode
uses `upsert` and `delete` records plus a checkpoint. Delete records carry `null` data.
An incremental batch may contain zero records when its prior normalized state exists; this is an
explicit no-op/checkpoint advance, not an empty snapshot.

Regardless of collection mode, the Normalizer must return one fully materialized normalized view.
Nivalis persists every successful normalized result as an immutable, versioned snapshot. On a later
incremental run, the preceding accepted normalized snapshot is supplied as `previous`; on replay,
the snapshot preceding the selected SyncRun is supplied. Normalized state and Widget projections
commit atomically.

This makes deltas an upstream transfer optimization without turning public reads into event replay.

## Normalization and projection

Normalization input carries Raw Snapshot records, collection mode/outcome, checkpoint, issues, and
the optional previous normalized view. Each Raw record adds immutable `snapshotId`, `payloadHash`,
`storedAt`, connection, and SyncRun lineage.

Normalization output is a `normalization.result` envelope with:

- one Provider-specific JSON object;
- a stable normalized schema ID and version;
- propagated checkpoint/outcome/issues;
- exact `(source, partition, snapshotId)` lineage for every input record.

Projection input combines that normalized result with explicit Widget targets. Projection output is
an all-or-nothing target batch; Nivalis independently verifies exactly one result for every active
`(widgetId, projectionKey)`.

## Failure envelope

An out-of-process or language-neutral adapter returns `kind: failure` instead of serializing an
exception:

```json
{
  "data": {
    "category": "rate_limit",
    "code": "provider-rate-limited",
    "credentialStatus": null,
    "message": "The Provider asked the client to retry later.",
    "partition": null,
    "retryable": true,
    "retryAfterMs": 1000,
    "source": "example.items"
  },
  "meta": {
    "correlationId": "00000000-0000-4000-8000-000000000601",
    "extensions": {},
    "kind": "failure",
    "protocol": "nivalis.provider-data",
    "protocolVersion": "2.0",
    "provider": "example"
  }
}
```

Categories are `transport`, `rate_limit`, `credential`, `schema`, `normalization`, `projection`,
`configuration`, `permanent`, and `protocol`. Only transport/rate-limit failures are retryable.
Issues and failures may identify a source partition without embedding its payload.
In-process adapters may throw the equivalent Domain error; remote proxies translate this envelope
back to the same taxonomy.

## Validation and security

Nivalis validates before every transition and before persistence:

- exact envelope/message kind, Provider, protocol version, and correlation;
- manifest capabilities, schema contracts, source allowlists, and declared limits;
- JSON/cycle safety, safe integers, byte counts, data shape, media type, and Blob references;
- canonical partition identity, continuation bounds, and required-source completeness;
- source and normalized version compatibility;
- exact immutable Raw/normalized lineage;
- namespaced-only extensions;
- credential-like keys/text across payloads, checkpoints, extensions, cursors, and messages.

Protocol violations, schema drift, sanitization failures, credential failures, transport failures,
normalization failures, and projection failures remain distinct. No failure replaces Last Known
Good normalized/native/projection state.

## Adapter acceptance checklist

1. Publish a valid manifest with honest capabilities and bounded limits.
2. Give every source a stable ID, data shape, schema URI, read/write versions, criticality,
   operations, partition kinds, payload kinds, and media types.
3. Keep collection read-only, time-bounded, retry-classified, and credential-safe.
4. Use continuation for large JSON and Blob references for large binary content.
5. Preserve exact identifiers/quantities as strings where JSON numbers would be lossy.
6. Explain partial results with structured issues and never silently fabricate missing data.
7. Normalize into a Provider-specific schema and emit complete Raw Snapshot lineage.
8. Apply public-disclosure policy before projection persistence.
9. Pass runtime negative tests, machine-schema conformance, replay, migration, PostgreSQL, and edge
   composition tests.
