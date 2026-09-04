# ADR 0023: Adopt a schema-driven general Provider Data Protocol 2.0

- Status: Accepted
- Date: 2026-09-04

## Context

The initial Provider boundary standardized Connector, Normalizer, and Projector interfaces, but
evaluation against planned music, source-control, video, animation, game, graph, time-series,
media, and large collection Providers exposed structural limits:

- one source `schemaVersion` could not distinguish current output from historical replay support;
- `single/pages/periods` encoded a few NetEase access patterns rather than general partitions;
- full arrays, full cache records, and no byte limits made scale an implicit assumption;
- partial results, checkpoints, incremental changes, binary references, and portable failures had
  no representation;
- message stages were not discriminated, and extensions had no namespace;
- normalized state was not retained generically, so a delta could not materialize a current view.

## Decision

Adopt [`nivalis.provider-data@2.0`](../PROVIDER_INTEGRATION_PROTOCOL.md).

1. Use a two-member `{ data, meta }` envelope with required message `kind`, operation
   `correlationId`, and namespaced `extensions`.
2. Make the runtime manifest a protocol message. It declares collection/payload capabilities,
   hard record/byte/cache/checkpoint/issue/continuation limits, normalized schema support, and a
   source catalog.
3. Describe every source using stable identity, criticality, data shape, media/payload types,
   operations, general partition kinds, and a stable schema URI.
4. Split schema compatibility into `producedVersion` and `acceptedVersions`. Fresh data uses the
   former; historical replay may use any accepted version.
5. Keep page/window identity out of source names by using `singleton`, `index`, `cursor`, `key`, or
   `time_window` partitions. Decode legacy `.page.N`/`.period.N` evidence at replay time.
6. Add complete/partial outcomes, structured issues, checkpoints, bounded continuation batches,
   snapshot `replace`, and incremental `upsert`/`delete` operations.
7. Keep JSON as the control/data interchange. Reject unsafe integer values; Provider schemas use
   strings for exact large integers and decimals.
8. Represent binary content only through checksummed logical ObjectStorage references.
9. Define a JSON-safe failure envelope for remote/language-neutral adapters and map it to the
   existing Domain error taxonomy in process.
10. Persist every successful normalized message as immutable state in the same transaction as
    native/projection completion. Supply the preceding compatible state to incremental
    normalization and historical replay.
11. Publish a JSON Schema and execute real Fixture messages against it in tests. Runtime validation
    remains stricter where rules span messages or manifest capabilities.

Provider-specific normalized schemas and native tables remain deliberate. Protocol 2 is not a
universal business ontology.

## Alternatives

- Extend the original interfaces with more `instances` values: rejected because it would keep
  encoding transfer mechanics into source identity and still omit version ranges, limits,
  outcomes, and operations.
- Adopt JSON:API: rejected because it specifies public resource representations, not collection,
  checkpoint, replay, or projection pipelines.
- Adopt CloudEvents unchanged: rejected because event metadata is useful for push events but does
  not describe Provider manifests, source schemas, snapshots, normalized state, or projections.
- Normalize all Providers into one activity/entity model: rejected because it destroys semantics
  or grows into a Provider-specific nullable union.
- Store deltas and rebuild public reads by replaying all events: rejected because Nivalis needs
  bounded Last Known Good reads and replaceable projections, not event sourcing.

## Consequences

- A new Provider can express scalar, document, collection, table, time-series, graph, GeoJSON,
  mixed, and media-reference data without changing the orchestration contract.
- Large sources can use bounded continuation; large binary values stay out of Worker memory and Raw
  JSON rows.
- Partial and incremental operation is explicit and testable. Public reads still consume a fully
  materialized normalized snapshot.
- Historical schema support becomes a conscious manifest decision rather than accidental breakage.
- Protocol messages are more verbose and validation is stricter. This is accepted at a low-volume
  integration boundary in exchange for safety and long-lived replay.
- Normalized snapshots add rebuildable storage. Retention and erasure policy must cover them with
  Raw evidence.
