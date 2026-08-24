import { ProjectionError } from "@nivalis/domain";
import type {
  BuiltWidgetProjection,
  JsonObject,
  NormalizedProviderData,
  ProjectionTarget,
  ProviderProjector
} from "@nivalis/domain";

import { isNeteaseNormalizedPayload } from "./netease-normalizer";
import { NETEASE_SOURCE, type NeteaseNormalizedPayload } from "./netease-types";

export class NeteaseProjector implements ProviderProjector {
  readonly provider = "netease" as const;

  async project(
    normalized: NormalizedProviderData,
    targets: readonly ProjectionTarget[]
  ): Promise<readonly BuiltWidgetProjection[]> {
    await Promise.resolve();
    if (!isNeteaseNormalizedPayload(normalized.payload)) {
      throw new ProjectionError("Normalized NetEase payload is invalid.");
    }
    const payload = normalized.payload as NeteaseNormalizedPayload;
    const sourceSnapshotId =
      normalized.sourceSnapshotIds[NETEASE_SOURCE.weeklyRecord] ??
      normalized.sourceSnapshotIds[NETEASE_SOURCE.account];
    if (!sourceSnapshotId) throw new ProjectionError("NetEase source snapshot is missing.");
    return targets.map((target) => {
      if (target.type !== "music.netease.overview" || target.schemaVersion !== 2) {
        throw new ProjectionError("NetEase target schema is unsupported.");
      }
      return {
        data: overview(payload, target.dataConfig),
        projectionKey: target.projectionKey,
        projectionSchemaVersion: 2,
        sourceSnapshotId,
        widgetId: target.id
      };
    });
  }
}

function overview(payload: NeteaseNormalizedPayload, dataConfig: JsonObject): JsonObject {
  const unavailable = (reason: string) => ({ availability: "unavailable", reason });
  const range = dataConfig.range === "7d" ? "7d" : null;
  const artistCounts = new Map<string, { name: string; plays: number }>();
  for (const record of payload.weeklyRecords) {
    for (const artist of record.track.artists) {
      const current = artistCounts.get(artist.providerArtistId);
      artistCounts.set(artist.providerArtistId, {
        name: artist.name,
        plays: (current?.plays ?? 0) + record.playCount
      });
    }
  }
  return {
    account: {
      availability: "available",
      displayName: payload.account.displayName,
      providerUserId: payload.account.providerUserId
    },
    listeningDuration:
      payload.listeningDurationMinutes === null
        ? unavailable("provider_omitted")
        : {
            availability: "available",
            provenance: "provider_reported",
            unit: "minutes",
            value: payload.listeningDurationMinutes
          },
    provider: "netease",
    recentListening: {
      availability: "available",
      coverage: "provider_recent_limit",
      items: payload.recentListens.slice(0, 20).map((item) => ({
        playedAt: item.playedAt,
        track: trackSummary(item.track)
      })),
      provenance: "provider_reported"
    },
    totalListenCount: {
      availability: "available",
      provenance: "provider_reported",
      unit: "plays",
      value: payload.totalListenCount
    },
    trend:
      payload.reportPoints.length === 0
        ? unavailable("provider_omitted")
        : {
            availability: "available",
            coverage: "provider_report",
            points: payload.reportPoints,
            provenance: "provider_reported"
          },
    weeklyListening:
      range === null
        ? unavailable("insufficient_coverage")
        : {
            availability: "available",
            coverage: "top_records",
            period: "provider_week",
            provenance: "nivalis_derived",
            rankedPlayCount: payload.weeklyRecords.reduce(
              (total, record) => total + record.playCount,
              0
            ),
            topArtists: [...artistCounts.entries()]
              .sort((left, right) => right[1].plays - left[1].plays)
              .slice(0, 5)
              .map(([providerArtistId, artist]) => ({
                name: artist.name,
                providerArtistId,
                rankedPlayCount: artist.plays
              })),
            topTracks: payload.weeklyRecords.slice(0, 20).map((record) => ({
              playCount: record.playCount,
              score: record.score,
              track: trackSummary(record.track)
            }))
          }
  };
}

function trackSummary(track: NeteaseNormalizedPayload["weeklyRecords"][number]["track"]) {
  return {
    albumName: track.albumName,
    artists: track.artists,
    coverUrl: track.coverUrl,
    durationMs: track.durationMs,
    name: track.name,
    providerTrackId: track.providerTrackId
  };
}
