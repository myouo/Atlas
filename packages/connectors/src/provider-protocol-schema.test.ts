import { readFile } from "node:fs/promises";
import path from "node:path";

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import {
  encodeProviderSourceContext,
  providerProtocolMetadata,
  toProviderSnapshotRecord,
  toProviderSyncRequest
} from "@nivalis/domain";
import type { ProjectionTarget, RawSnapshot, SyncRun } from "@nivalis/domain";
import { expect, it } from "vitest";

import { FixtureProviderRuntime } from "./fixture/fixture-provider";

it("keeps executable Provider messages conformant with the protocol JSON Schema", async () => {
  const schema = JSON.parse(
    await readFile(path.resolve("docs/schemas/provider-data-protocol.v2.schema.json"), "utf8")
  ) as object;
  const validate = addFormats(new Ajv2020({ allErrors: true, strict: false })).compile(schema);
  const runtime = new FixtureProviderRuntime();
  const run = syncRun();
  const request = toProviderSyncRequest(run);
  const collection = await runtime.connector.collect(request);
  const source = collection.data.records[0]!;
  const raw: RawSnapshot = {
    createdAt: new Date("2026-09-04T00:00:02.000Z"),
    fetchedAt: new Date(source.meta.collectedAt),
    id: "00000000-0000-4000-8000-000000000602",
    payload: source.data,
    payloadHash: "a".repeat(64),
    provider: "fixture",
    providerConnectionId: run.providerConnectionId,
    schemaVersion: source.meta.schemaVersion,
    sourceCursor: encodeProviderSourceContext(source, collection.data),
    sourceKind: source.meta.source,
    sourceTimestamp: null,
    syncRunId: run.id
  };
  const snapshot = toProviderSnapshotRecord(raw);
  const normalizationRequest = {
    data: {
      checkpoint: collection.data.checkpoint,
      collectionMode: collection.data.mode,
      collectionOutcome: collection.data.outcome,
      issues: collection.data.issues,
      previous: null,
      records: [snapshot]
    },
    meta: providerProtocolMetadata("normalization.request", "fixture", run.id)
  } as const;
  const normalized = await runtime.normalizer.normalize(normalizationRequest);
  const projectionRequest = {
    data: { normalized, targets: [target()] },
    meta: providerProtocolMetadata("projection.request", "fixture", run.id)
  } as const;
  const projection = await runtime.projector.project(projectionRequest);
  const failure = {
    data: {
      category: "transport",
      code: "provider-unavailable",
      credentialStatus: null,
      message: "The Provider is temporarily unavailable.",
      partition: null,
      retryable: true,
      retryAfterMs: 1_000,
      source: null
    },
    meta: providerProtocolMetadata("failure", "fixture", run.id)
  } as const;

  for (const message of [
    runtime.manifest,
    request,
    collection,
    source,
    snapshot,
    normalizationRequest,
    normalized,
    projectionRequest,
    projection,
    failure
  ]) {
    expect(validate(message), JSON.stringify(validate.errors)).toBe(true);
  }

  expect(
    validate({
      ...request,
      meta: { ...request.meta, protocolVersion: "1.0" }
    })
  ).toBe(false);
  expect(
    validate({
      ...source,
      data: { unsafeInteger: Number.MAX_SAFE_INTEGER + 1 }
    })
  ).toBe(false);
  expect(
    validate({
      ...source,
      meta: { ...source.meta, unnamespacedField: true }
    })
  ).toBe(false);
});

function syncRun(): SyncRun {
  return {
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
}

function target(): ProjectionTarget {
  return {
    dataConfig: {},
    enabled: true,
    id: "00000000-0000-4000-8000-000000000701",
    presentationConfig: {},
    projectionKey: "b".repeat(64),
    provider: "fixture",
    schemaVersion: 1,
    title: "GitHub",
    type: "github.profile"
  };
}
