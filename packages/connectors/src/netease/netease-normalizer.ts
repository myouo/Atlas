import { ProviderSchemaMismatchError } from "@nivalis/domain";
import type {
  JsonObject,
  NormalizedProviderData,
  ProviderNormalizer,
  RawSnapshot
} from "@nivalis/domain";
import Value from "typebox/value";
import type { Static, TSchema } from "typebox";

import {
  NeteaseAccountResponseSchema,
  NeteaseListenReportResponseSchema,
  NeteaseRecentSongsResponseSchema,
  NeteaseUserLevelResponseSchema,
  NeteaseWeeklyRecordResponseSchema
} from "./schemas/provider-schemas";
import {
  NETEASE_SOURCE,
  type NeteaseNormalizedArtist,
  type NeteaseNormalizedPayload,
  type NeteaseNormalizedTrack
} from "./netease-types";

export class NeteaseNormalizer implements ProviderNormalizer {
  readonly provider = "netease" as const;

  async normalize(snapshots: readonly RawSnapshot[]): Promise<NormalizedProviderData> {
    await Promise.resolve();
    const accountSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.account);
    const levelSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.userLevel);
    const weeklySnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.weeklyRecord);
    const recentSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.recentSongs);
    const reportSnapshot = requiredSnapshot(snapshots, NETEASE_SOURCE.listenReportWeek);

    const account = checked(NeteaseAccountResponseSchema, accountSnapshot);
    const level = checked(NeteaseUserLevelResponseSchema, levelSnapshot);
    const weekly = checked(NeteaseWeeklyRecordResponseSchema, weeklySnapshot);
    const recent = checked(NeteaseRecentSongsResponseSchema, recentSnapshot);
    const report = checked(NeteaseListenReportResponseSchema, reportSnapshot);

    const payload: NeteaseNormalizedPayload = {
      account: {
        displayName: account.profile?.nickname ?? null,
        providerUserId: String(account.profile?.userId ?? account.account.id)
      },
      listeningDurationMinutes:
        report.data.duration === undefined ? null : report.data.duration / 60,
      recentListens: recent.data.list.map((item) => ({
        playedAt: new Date(item.playTime).toISOString(),
        track: normalizeTrack(item.resource)
      })),
      reportPoints: (report.data.points ?? []).map((point) => ({
        label: point.label,
        minutes: point.duration / 60
      })),
      totalListenCount: level.data.listenSongs,
      weeklyRecords: weekly.weekData.map((item) => ({
        playCount: item.playCount,
        score: item.score,
        track: normalizeTrack(item.song)
      }))
    };

    return {
      payload,
      provider: "netease",
      schemaVersion: 1,
      sourceSnapshotIds: Object.fromEntries(
        snapshots.map((snapshot) => [snapshot.sourceKind, snapshot.id])
      )
    };
  }
}

function requiredSnapshot(snapshots: readonly RawSnapshot[], sourceKind: string) {
  const snapshot = snapshots.find((candidate) => candidate.sourceKind === sourceKind);
  if (!snapshot) throw new ProviderSchemaMismatchError(sourceKind);
  return snapshot;
}

function checked<T extends TSchema>(schema: T, snapshot: RawSnapshot): Static<T> {
  if (!Value.Check(schema, snapshot.payload)) {
    throw new ProviderSchemaMismatchError(snapshot.sourceKind);
  }
  return snapshot.payload as Static<T>;
}

function normalizeTrack(track: {
  readonly al?: { readonly id?: number | string; readonly name?: string; readonly picUrl?: string };
  readonly ar: readonly { readonly id: number | string; readonly name: string }[];
  readonly dt?: number;
  readonly id: number | string;
  readonly name: string;
}): NeteaseNormalizedTrack {
  return {
    albumName: track.al?.name ?? null,
    albumProviderId: track.al?.id === undefined ? null : String(track.al.id),
    artists: track.ar.map((artist): NeteaseNormalizedArtist => ({
      name: artist.name,
      providerArtistId: String(artist.id)
    })),
    coverUrl: safeArtworkUrl(track.al?.picUrl),
    durationMs: track.dt ?? null,
    name: track.name,
    providerTrackId: String(track.id)
  };
}

function safeArtworkUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isNeteaseNormalizedPayload(value: JsonObject): value is NeteaseNormalizedPayload {
  return (
    typeof value.totalListenCount === "number" &&
    Array.isArray(value.weeklyRecords) &&
    Array.isArray(value.recentListens) &&
    Array.isArray(value.reportPoints) &&
    value.account !== null &&
    typeof value.account === "object"
  );
}
