import {
  ProviderProtocolError,
  RetryableProviderError,
  SyncPipelineError,
  toProviderSyncRequest
} from "@nivalis/domain";
import type {
  JsonObject,
  ProviderCollectionMode,
  ProviderCollectionOutcome,
  ProviderIssue,
  ProviderRuntimeModule,
  ProviderSourceRecord,
  SyncRun
} from "@nivalis/domain";

import {
  assertProviderCollection,
  assertProviderManifest,
  assertProviderRecordSet,
  assertProviderSyncRequest,
  providerRecordIdentity,
  providerMessageByteLength,
  unwrapProviderResult
} from "../validation/provider-protocol-validation";

export interface CollectedProviderData {
  readonly checkpoint: JsonObject | null;
  readonly issues: readonly ProviderIssue[];
  readonly mode: ProviderCollectionMode;
  readonly outcome: ProviderCollectionOutcome;
  readonly records: readonly ProviderSourceRecord[];
}

/** Pull every bounded continuation batch and return one deterministic normalization input. */
export async function collectProviderData(
  runtime: ProviderRuntimeModule,
  run: SyncRun,
  options: {
    readonly cachedRecords?: readonly ProviderSourceRecord[];
    readonly checkpoint?: JsonObject | null;
  } = {}
): Promise<CollectedProviderData> {
  assertProviderManifest(runtime.manifest, run.provider);
  const records: ProviderSourceRecord[] = [];
  const issues: ProviderIssue[] = [];
  const issueIdentities = new Set<string>();
  const continuations = new Set<string>();
  let checkpoint = options.checkpoint ?? null;
  let continuation: string | null = null;
  let mode: ProviderCollectionMode | null = null;
  let outcome: ProviderCollectionOutcome = "complete";
  let totalBytes = 0;

  for (
    let batchIndex = 0;
    batchIndex < runtime.manifest.data.limits.maxContinuationBatches;
    batchIndex += 1
  ) {
    const request = toProviderSyncRequest(run, {
      cachedRecords: batchIndex === 0 ? (options.cachedRecords ?? []) : [],
      checkpoint,
      continuation
    });
    assertProviderSyncRequest(request, runtime.manifest);
    const result = await collectBatch(runtime, request);
    const batch = unwrapProviderResult(result, runtime.manifest, run.id);
    assertProviderCollection(batch, runtime.manifest, run.id, false);
    totalBytes += providerMessageByteLength(batch);
    if (totalBytes > runtime.manifest.data.limits.maxCollectionBytes) {
      throw new ProviderProtocolError("Provider exceeded its declared collection byte limit.");
    }
    if (mode !== null && batch.data.mode !== mode) {
      throw new ProviderProtocolError("Continuation batches changed collection mode.");
    }
    mode = batch.data.mode;
    if (batch.data.outcome === "partial") outcome = "partial";
    records.push(...batch.data.records);
    for (const issue of batch.data.issues) {
      const identity = `${issue.code}\u0000${issue.source ?? ""}\u0000${
        issue.partition ? providerRecordIdentity(issue.source ?? "", issue.partition) : ""
      }`;
      if (issueIdentities.has(identity)) continue;
      issueIdentities.add(identity);
      issues.push(issue);
    }
    checkpoint = batch.data.checkpoint;
    continuation = batch.data.continuation;
    if (continuation === null) {
      assertProviderRecordSet(records, runtime.manifest, outcome, mode);
      return { checkpoint, issues, mode, outcome, records };
    }
    if (continuations.has(continuation)) {
      throw new ProviderProtocolError("Provider repeated a continuation token.");
    }
    continuations.add(continuation);
  }

  throw new ProviderProtocolError("Provider exceeded its declared continuation-batch limit.");
}

async function collectBatch(
  runtime: ProviderRuntimeModule,
  request: ReturnType<typeof toProviderSyncRequest>
) {
  try {
    return await runtime.connector.collect(request);
  } catch (error) {
    if (error instanceof SyncPipelineError) throw error;
    throw new RetryableProviderError("Provider collection failed transiently.");
  }
}
