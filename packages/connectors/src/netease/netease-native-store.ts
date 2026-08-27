import { randomUUID } from "node:crypto";

import type { ProviderNativeStore } from "@nivalis/application";
import { ProjectionError } from "@nivalis/domain";
import type { JsonObject } from "@nivalis/domain";
import type { ColumnType, Kysely, Transaction } from "kysely";

import { isNeteaseNormalizedPayload } from "./netease-normalizer";
import { buildNeteaseOwnerDataCatalog } from "./netease-projector";
import {
  NETEASE_SOURCE,
  type NeteaseNormalizedPayload,
  type NeteaseNormalizedTrack
} from "./netease-types";

type Timestamp = ColumnType<Date, Date, Date>;

export interface NeteaseNativeDatabase {
  provider_data_catalogs: {
    data: ColumnType<JsonObject, string, string>;
    data_version_id: string;
    generated_at: Timestamp;
    provider: "netease";
    provider_connection_id: string;
    schema_version: number;
  };
  netease_accounts: {
    created_at: Timestamp;
    display_name: string | null;
    last_validated_at: Timestamp;
    provider_connection_id: string;
    provider_user_id: string;
    updated_at: Timestamp;
  };
  netease_artists: {
    created_at: Timestamp;
    id: string;
    name: string;
    provider_artist_id: string;
    provider_connection_id: string;
    updated_at: Timestamp;
  };
  netease_metric_snapshots: {
    id: string;
    metric:
      | "total_listen_count"
      | "listening_duration"
      | "listening_duration_month"
      | "listening_duration_total";
    observed_at: Timestamp;
    period: string;
    provenance: "provider_reported" | "nivalis_derived";
    provider_connection_id: string;
    source_snapshot_id: string;
    unit: "plays" | "minutes" | "seconds";
    value: number | string;
  };
  netease_recent_listens: {
    created_at: Timestamp;
    id: string;
    provider_connection_id: string;
    provider_played_at: Timestamp;
    source_snapshot_id: string;
    track_id: string;
  };
  netease_track_artists: { artist_id: string; position: number; track_id: string };
  netease_track_play_snapshots: {
    id: string;
    observed_at: Timestamp;
    period: "week" | "all_time";
    play_count: number;
    provider_connection_id: string;
    score: number | string | null;
    source_snapshot_id: string;
    track_id: string;
  };
  netease_tracks: {
    album_name: string | null;
    album_provider_id: string | null;
    cover_url: string | null;
    created_at: Timestamp;
    duration_ms: number | null;
    id: string;
    name: string;
    provider_connection_id: string;
    provider_track_id: string;
    updated_at: Timestamp;
  };
  provider_connections: {
    account_key: string;
    id: string;
    updated_at: Timestamp;
  };
}

type Executor = Kysely<NeteaseNativeDatabase> | Transaction<NeteaseNativeDatabase>;

export class KyselyNeteaseNativeStore implements ProviderNativeStore {
  readonly provider = "netease" as const;

  constructor(private readonly database: Executor) {}

  async persist(input: {
    readonly generatedAt: Date;
    readonly normalized: import("@nivalis/domain").NormalizedProviderData;
    readonly providerConnectionId: string;
  }) {
    const payload = input.normalized.payload;
    if (!isNeteaseNormalizedPayload(payload)) {
      throw new ProjectionError("Cannot persist invalid normalized NetEase data.");
    }
    const now = input.generatedAt;
    await this.database
      .insertInto("netease_accounts")
      .values({
        created_at: now,
        display_name: payload.account.displayName,
        last_validated_at: now,
        provider_connection_id: input.providerConnectionId,
        provider_user_id: payload.account.providerUserId,
        updated_at: now
      })
      .onConflict((conflict) =>
        conflict.column("provider_connection_id").doUpdateSet({
          display_name: payload.account.displayName,
          last_validated_at: now,
          provider_user_id: payload.account.providerUserId,
          updated_at: now
        })
      )
      .execute();
    await this.database
      .updateTable("provider_connections")
      .set({ account_key: payload.account.providerUserId, updated_at: now })
      .where("id", "=", input.providerConnectionId)
      .execute();

    await this.database
      .insertInto("provider_data_catalogs")
      .values({
        data: JSON.stringify(buildNeteaseOwnerDataCatalog(payload)),
        data_version_id: randomUUID(),
        generated_at: now,
        provider: "netease",
        provider_connection_id: input.providerConnectionId,
        schema_version: 1
      })
      .onConflict((conflict) =>
        conflict.column("provider_connection_id").doUpdateSet((excluded) => ({
          data: excluded.ref("excluded.data"),
          data_version_id: excluded.ref("excluded.data_version_id"),
          generated_at: excluded.ref("excluded.generated_at"),
          schema_version: excluded.ref("excluded.schema_version")
        }))
      )
      .execute();

    const tracks = uniqueTracks(payload);
    const trackIds = new Map<string, string>();
    for (const track of tracks) {
      trackIds.set(
        track.providerTrackId,
        await this.upsertTrack(input.providerConnectionId, track, now)
      );
    }

    const weeklySource = requiredSource(
      input.normalized.sourceSnapshotIds,
      NETEASE_SOURCE.weeklyRecord
    );
    for (const record of payload.weeklyRecords) {
      await this.database
        .insertInto("netease_track_play_snapshots")
        .values({
          id: randomUUID(),
          observed_at: now,
          period: "week",
          play_count: record.playCount,
          provider_connection_id: input.providerConnectionId,
          score: record.score,
          source_snapshot_id: weeklySource,
          track_id: trackIds.get(record.track.providerTrackId)!
        })
        .onConflict((conflict) =>
          conflict.columns(["source_snapshot_id", "track_id", "period"]).doNothing()
        )
        .execute();
    }

    const allTimeSource = requiredSource(
      input.normalized.sourceSnapshotIds,
      NETEASE_SOURCE.allTimeRecord
    );
    for (const record of payload.allTimeRecords) {
      await this.database
        .insertInto("netease_track_play_snapshots")
        .values({
          id: randomUUID(),
          observed_at: now,
          period: "all_time",
          play_count: record.playCount,
          provider_connection_id: input.providerConnectionId,
          score: record.score,
          source_snapshot_id: allTimeSource,
          track_id: trackIds.get(record.track.providerTrackId)!
        })
        .onConflict((conflict) =>
          conflict.columns(["source_snapshot_id", "track_id", "period"]).doNothing()
        )
        .execute();
    }

    const recentSource = requiredSource(
      input.normalized.sourceSnapshotIds,
      NETEASE_SOURCE.recentSongs
    );
    for (const listen of payload.recentListens) {
      await this.database
        .insertInto("netease_recent_listens")
        .values({
          created_at: now,
          id: randomUUID(),
          provider_connection_id: input.providerConnectionId,
          provider_played_at: new Date(listen.playedAt),
          source_snapshot_id: recentSource,
          track_id: trackIds.get(listen.track.providerTrackId)!
        })
        .onConflict((conflict) =>
          conflict.columns(["provider_connection_id", "track_id", "provider_played_at"]).doNothing()
        )
        .execute();
    }

    await this.insertMetric(
      input.providerConnectionId,
      "total_listen_count",
      payload.totalListenCount,
      "plays",
      "all_time",
      requiredSource(input.normalized.sourceSnapshotIds, NETEASE_SOURCE.userDetail),
      now
    );
    if (payload.listeningDurationMinutes !== null) {
      await this.insertMetric(
        input.providerConnectionId,
        "listening_duration",
        payload.listeningDurationMinutes,
        "minutes",
        "week",
        requiredSource(input.normalized.sourceSnapshotIds, NETEASE_SOURCE.listenReportWeek),
        now
      );
    }
    if (payload.monthlyListeningDurationMinutes !== null) {
      await this.insertMetric(
        input.providerConnectionId,
        "listening_duration_month",
        payload.monthlyListeningDurationMinutes,
        "minutes",
        "month",
        requiredSource(input.normalized.sourceSnapshotIds, NETEASE_SOURCE.listenReportMonth),
        now
      );
    }
    if (payload.listeningDurationTotalSeconds !== null) {
      await this.insertMetric(
        input.providerConnectionId,
        "listening_duration_total",
        payload.listeningDurationTotalSeconds,
        "seconds",
        "all_time",
        requiredSource(input.normalized.sourceSnapshotIds, NETEASE_SOURCE.listenTotal),
        now
      );
    }
  }

  private async upsertTrack(connectionId: string, track: NeteaseNormalizedTrack, now: Date) {
    const row = await this.database
      .insertInto("netease_tracks")
      .values({
        album_name: track.albumName,
        album_provider_id: track.albumProviderId,
        cover_url: track.coverUrl,
        created_at: now,
        duration_ms: track.durationMs,
        id: randomUUID(),
        name: track.name,
        provider_connection_id: connectionId,
        provider_track_id: track.providerTrackId,
        updated_at: now
      })
      .onConflict((conflict) =>
        conflict.columns(["provider_connection_id", "provider_track_id"]).doUpdateSet({
          album_name: track.albumName,
          album_provider_id: track.albumProviderId,
          cover_url: track.coverUrl,
          duration_ms: track.durationMs,
          name: track.name,
          updated_at: now
        })
      )
      .returning("id")
      .executeTakeFirstOrThrow();
    await this.database
      .deleteFrom("netease_track_artists")
      .where("track_id", "=", row.id)
      .execute();
    for (const [position, artist] of track.artists.entries()) {
      const persisted = await this.database
        .insertInto("netease_artists")
        .values({
          created_at: now,
          id: randomUUID(),
          name: artist.name,
          provider_artist_id: artist.providerArtistId,
          provider_connection_id: connectionId,
          updated_at: now
        })
        .onConflict((conflict) =>
          conflict.columns(["provider_connection_id", "provider_artist_id"]).doUpdateSet({
            name: artist.name,
            updated_at: now
          })
        )
        .returning("id")
        .executeTakeFirstOrThrow();
      await this.database
        .insertInto("netease_track_artists")
        .values({ artist_id: persisted.id, position, track_id: row.id })
        .execute();
    }
    return row.id;
  }

  private async insertMetric(
    connectionId: string,
    metric:
      | "total_listen_count"
      | "listening_duration"
      | "listening_duration_month"
      | "listening_duration_total",
    value: number,
    unit: "plays" | "minutes" | "seconds",
    period: string,
    sourceSnapshotId: string,
    observedAt: Date
  ) {
    await this.database
      .insertInto("netease_metric_snapshots")
      .values({
        id: randomUUID(),
        metric,
        observed_at: observedAt,
        period,
        provenance: "provider_reported",
        provider_connection_id: connectionId,
        source_snapshot_id: sourceSnapshotId,
        unit,
        value
      })
      .onConflict((conflict) =>
        conflict.columns(["source_snapshot_id", "metric", "period"]).doNothing()
      )
      .execute();
  }
}

function uniqueTracks(payload: NeteaseNormalizedPayload) {
  const tracks = new Map<string, NeteaseNormalizedTrack>();
  for (const record of payload.weeklyRecords) {
    tracks.set(record.track.providerTrackId, record.track);
  }
  for (const record of payload.allTimeRecords) {
    tracks.set(record.track.providerTrackId, record.track);
  }
  for (const listen of payload.recentListens) {
    tracks.set(listen.track.providerTrackId, listen.track);
  }
  return [...tracks.values()];
}

function requiredSource(sources: Readonly<Record<string, string>>, sourceKind: string) {
  const id = sources[sourceKind];
  if (!id) throw new ProjectionError(`NetEase source '${sourceKind}' is missing.`);
  return id;
}
