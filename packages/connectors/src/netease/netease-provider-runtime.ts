import type { ProviderCredentialResolver } from "@nivalis/application";
import {
  PROVIDER_JSON_MEDIA_TYPE,
  providerNormalizedSchemaId,
  providerProtocolMetadata,
  providerSourceSchemaId
} from "@nivalis/domain";
import type {
  ProviderDataShape,
  ProviderPartitionKind,
  ProviderRuntimeManifest,
  ProviderRuntimeModule,
  ProviderSourceDefinition
} from "@nivalis/domain";

import { NeteaseClient, type NeteaseClientOptions } from "./netease-client";
import { NeteaseConnector } from "./netease-connector";
import { NeteaseNormalizer } from "./netease-normalizer";
import { NeteaseProjector } from "./netease-projector";
import { NETEASE_SOURCE } from "./netease-types";

export interface NeteaseProviderRuntimeOptions extends NeteaseClientOptions {
  readonly requestConcurrency?: number;
}

export const NETEASE_PROVIDER_MANIFEST = {
  data: {
    capabilities: {
      collectionModes: ["snapshot"],
      continuation: false,
      partialResults: false,
      payloadKinds: ["json"]
    },
    displayName: "NetEase Cloud Music",
    extensions: {},
    limits: {
      maxBatchBytes: 16_000_000,
      maxBatchRecords: 128,
      maxCacheRecords: 16,
      maxCheckpointBytes: 16_384,
      maxCollectionBytes: 32_000_000,
      maxContinuationBatches: 1,
      maxIssues: 64,
      maxNormalizedBytes: 16_000_000,
      maxProjectionBytes: 16_000_000,
      maxRecordBytes: 5_000_000
    },
    normalizedSchema: {
      acceptedVersions: [1],
      id: providerNormalizedSchemaId("netease"),
      producedVersion: 1
    },
    sources: [
      neteaseSource(NETEASE_SOURCE.account, "document"),
      neteaseSource(NETEASE_SOURCE.allTimeRecord, "collection"),
      neteaseSource(NETEASE_SOURCE.createdPlaylists, "collection", ["index", "singleton"]),
      neteaseSource(NETEASE_SOURCE.followers, "collection", ["index", "singleton"]),
      neteaseSource(NETEASE_SOURCE.following, "collection", ["index", "singleton"]),
      neteaseSource(NETEASE_SOURCE.listenTotal, "document"),
      neteaseSource(NETEASE_SOURCE.listenRankMonth, "time_series"),
      neteaseSource(NETEASE_SOURCE.listenRankWeek, "time_series"),
      neteaseSource(NETEASE_SOURCE.listenReportMonth, "time_series"),
      neteaseSource(
        NETEASE_SOURCE.listenReportPreviousMonth,
        "time_series",
        ["index", "singleton"],
        "optional"
      ),
      neteaseSource(
        NETEASE_SOURCE.listenReportPreviousWeek,
        "time_series",
        ["index", "singleton"],
        "optional"
      ),
      neteaseSource(NETEASE_SOURCE.listenReportWeek, "time_series"),
      neteaseSource(NETEASE_SOURCE.medals, "collection"),
      neteaseSource(NETEASE_SOURCE.musicCardTracks, "collection", ["singleton"], "optional"),
      neteaseSource(NETEASE_SOURCE.profileHome, "document"),
      neteaseSource(NETEASE_SOURCE.profileMusicCards, "collection"),
      neteaseSource(
        NETEASE_SOURCE.profileShowcase,
        "mixed",
        ["cursor", "index", "singleton"],
        "optional"
      ),
      neteaseSource(NETEASE_SOURCE.recentSongs, "collection"),
      neteaseSource(NETEASE_SOURCE.socialStatus, "document"),
      neteaseSource(NETEASE_SOURCE.userDetail, "document"),
      neteaseSource(NETEASE_SOURCE.userLevel, "document"),
      neteaseSource(NETEASE_SOURCE.vipInfo, "document"),
      neteaseSource(NETEASE_SOURCE.weeklyRecord, "collection")
    ]
  },
  meta: providerProtocolMetadata("manifest", "netease")
} as const satisfies ProviderRuntimeManifest;

function neteaseSource(
  id: string,
  dataShape: ProviderDataShape,
  partitions: readonly ProviderPartitionKind[] = ["singleton"],
  criticality: ProviderSourceDefinition["criticality"] = "required"
): ProviderSourceDefinition {
  return {
    criticality,
    dataShape,
    extensions: {},
    id,
    mediaTypes: [PROVIDER_JSON_MEDIA_TYPE],
    operations: ["replace"],
    partitions,
    payloadKinds: ["json"],
    schema: {
      acceptedVersions: [1],
      id: providerSourceSchemaId("netease", id),
      producedVersion: 1
    }
  };
}

export class NeteaseProviderRuntime implements ProviderRuntimeModule {
  readonly connector: NeteaseConnector;
  readonly manifest = NETEASE_PROVIDER_MANIFEST;
  readonly normalizer = new NeteaseNormalizer();
  readonly projector = new NeteaseProjector();

  constructor(
    credentials: ProviderCredentialResolver,
    options: NeteaseProviderRuntimeOptions,
    fetcher: typeof fetch = fetch
  ) {
    this.connector = new NeteaseConnector(
      new NeteaseClient(options, fetcher),
      credentials,
      () => new Date(),
      options.requestConcurrency
    );
  }
}
