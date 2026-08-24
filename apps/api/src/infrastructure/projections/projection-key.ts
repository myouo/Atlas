import { createHash, randomUUID } from "node:crypto";

import type { SyncIdentityFactory, ViewVersionFactory } from "@nivalis/application";
import type { JsonValue, ProjectionIdentityInput, WidgetProjectionVersion } from "@nivalis/domain";

export function createProjectionKey(input: ProjectionIdentityInput) {
  return hashCanonical({
    dataConfig: input.dataConfig,
    schemaVersion: input.schemaVersion,
    type: input.type
  });
}

export class Sha256ViewVersionFactory implements ViewVersionFactory {
  createDataVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]) {
    return createRepresentationVersion(revisionId, versions);
  }

  createViewVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]) {
    return createRepresentationVersion(revisionId, versions);
  }
}

export class CryptoSyncIdentityFactory implements SyncIdentityFactory {
  create() {
    return randomUUID();
  }

  hashPayload(payload: JsonValue) {
    return hashCanonical(payload);
  }
}

function createRepresentationVersion(
  revisionId: string,
  versions: readonly WidgetProjectionVersion[]
) {
  return hashCanonical({
    revisionId,
    versions: [...versions]
      .sort((left, right) =>
        `${left.widgetId}:${left.projectionKey}`.localeCompare(
          `${right.widgetId}:${right.projectionKey}`
        )
      )
      .map((version) => ({
        projectionKey: version.projectionKey,
        projectionVersion: version.projectionVersion,
        representationVersion: version.representationVersion ?? version.projectionVersion,
        widgetId: version.widgetId
      }))
  });
}

function hashCanonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
