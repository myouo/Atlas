import type { ViewVersionFactory } from "@nivalis/application";
import type { WidgetProjectionVersion } from "@nivalis/domain";

export class PortableViewVersionFactory implements ViewVersionFactory {
  createDataVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]) {
    return hashVersion(revisionId, versions);
  }

  createViewVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]) {
    return hashVersion(revisionId, versions);
  }
}

async function hashVersion(revisionId: string, versions: readonly WidgetProjectionVersion[]) {
  const representation = JSON.stringify({
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(representation));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
