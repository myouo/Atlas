import { createDecipheriv } from "node:crypto";

import { assertProviderCollection } from "@nivalis/application";
import {
  encodeProviderSourceContext,
  providerProtocolMetadata,
  ProviderCredentialError,
  ProviderSchemaMismatchError,
  RetryableProviderError,
  toProviderSyncRequest,
  toProviderSnapshotRecord
} from "@nivalis/domain";
import type {
  JsonObject,
  NormalizedProviderData,
  ProjectionTarget,
  ProviderSourceRecord,
  RawSnapshot,
  SyncRun
} from "@nivalis/domain";
import { describe, expect, it, vi } from "vitest";

import {
  emptyNeteaseFixture,
  createNeteaseHttpFixtureFetcher,
  historicalListenReportFixture,
  largeNeteaseFixture,
  missingFieldFixture,
  normalNeteaseFixture,
  partialNeteaseFixture,
  schemaDriftFixture,
  showcaseSchemaDriftFixture,
  unknownEnumFixture
} from "./fixtures";
import { NeteaseClient } from "./netease-client";
import { NeteaseAuthClient } from "./netease-auth-client";
import { NeteaseConnector, sanitizeNeteasePayload } from "./netease-connector";
import { NeteaseNormalizer } from "./netease-normalizer";
import { probeNeteaseMusicCards } from "./netease-music-cards-probe";
import { NeteaseProjector, buildNeteaseOwnerDataCatalog } from "./netease-projector";
import { NETEASE_PROVIDER_MANIFEST } from "./netease-provider-runtime";
import {
  NETEASE_SOURCE,
  type NeteaseNormalizedPayload,
  type NeteaseSourceKind
} from "./netease-types";

const fetchedAt = new Date("2026-08-24T04:00:00.000Z");
const connectionId = "00000000-0000-4000-8000-000000000501";
const secret = "private-cookie-value-for-tests";

describe("NetEase Provider module", () => {
  it("probes the real music-card path without API, Worker, Queue, or database infrastructure", async () => {
    const result = await probeNeteaseMusicCards(
      new NeteaseClient({ timeoutMs: 2_000 }, createNeteaseHttpFixtureFetcher("normal")),
      secret
    );

    expect(result).toMatchObject({ cardLimit: 6, open: true, songDetailsResolved: 5 });
    expect(result.cards).toHaveLength(6);
    expect(result.cards[0]).toMatchObject({
      resourceType: "song_rank",
      subtitle: null,
      title: "听歌排行"
    });
    expect(result.cards[1]).toMatchObject({
      artists: ["Aimer"],
      resourceType: "song",
      subtitle: "Aimer"
    });
  });

  it("acquires MUSIC_U through QR and SMS without returning a full Cookie collection", async () => {
    const qrClient = new NeteaseAuthClient(
      { timeoutMs: 2_000 },
      createNeteaseHttpFixtureFetcher("normal")
    );
    const prepared = await qrClient.beginQr();
    expect(prepared.qrUrl).toContain("music.163.com/login?codekey=");
    await expect(qrClient.pollQr(prepared.privateState)).resolves.toEqual({
      status: "waiting_for_scan"
    });
    await expect(qrClient.pollQr(prepared.privateState)).resolves.toEqual({
      status: "waiting_for_confirmation"
    });
    const qrConnected = await qrClient.pollQr(prepared.privateState);
    expect(qrConnected).toMatchObject({ status: "connected" });
    if (qrConnected.status !== "connected") throw new Error("QR fixture did not connect.");
    expect(qrConnected.credential).toBe("nivalis_fixture_music_u_credential");
    const freshQr = await qrClient.beginQr();
    expect(freshQr.qrUrl).not.toBe(prepared.qrUrl);
    await expect(qrClient.pollQr(freshQr.privateState)).resolves.toEqual({
      status: "waiting_for_scan"
    });

    const smsClient = new NeteaseAuthClient(
      { timeoutMs: 2_000 },
      createNeteaseHttpFixtureFetcher("normal")
    );
    await expect(
      smsClient.sendSms(JSON.stringify({ countryCode: "86", phone: "13800138000" }))
    ).resolves.toBeUndefined();
    await expect(
      smsClient.verifySms(
        JSON.stringify({ code: "123456", countryCode: "86", phone: "13800138000" })
      )
    ).resolves.toEqual({ credential: "nivalis_fixture_music_u_credential" });
  });

  it("maps QR expiration, SMS risk control, and auth schema drift without leaking inputs", async () => {
    const expired = new NeteaseAuthClient(
      { timeoutMs: 2_000 },
      createNeteaseHttpFixtureFetcher("credential_expired")
    );
    const prepared = await expired.beginQr();
    await expect(expired.pollQr(prepared.privateState)).resolves.toEqual({ status: "expired" });
    await expect(
      expired.sendSms(JSON.stringify({ countryCode: "86", phone: "13800138000" }))
    ).rejects.toMatchObject({ reason: "risk_control" });

    const drift = new NeteaseAuthClient(
      { timeoutMs: 2_000 },
      createNeteaseHttpFixtureFetcher("schema_drift")
    );
    await expect(drift.beginQr()).rejects.toMatchObject({
      sourceKind: "netease.auth.qr_key"
    });
  });

  it("validates, normalizes, and projects honest Provider/Nivalis semantics", async () => {
    const normalized = await normalize(snapshots(normalNeteaseFixture));
    const [projection] = await project(normalized, [target("7d")]);
    expect(projection?.projectionSchemaVersion).toBe(2);
    expect(projection?.data).toMatchObject({
      account: {
        availability: "available",
        providerUserId: "10001",
        webUrl: "https://music.163.com/user/home?id=10001"
      },
      listeningDuration: {
        availability: "available",
        provenance: "provider_reported",
        value: 91
      },
      totalListenCount: {
        availability: "available",
        provenance: "provider_reported",
        value: 6421
      },
      weeklyListening: {
        availability: "available",
        coverage: "top_records",
        provenance: "nivalis_derived",
        rankedPlayCount: 22,
        topArtists: expect.arrayContaining([
          expect.objectContaining({ webUrl: "https://music.163.com/artist?id=30001" })
        ]),
        topTracks: expect.arrayContaining([
          expect.objectContaining({
            track: expect.objectContaining({ webUrl: "https://music.163.com/song?id=20001" })
          })
        ])
      }
    });
  });

  it("builds semantic cards and enforces public dataConfig allowlists server-side", async () => {
    const normalized = await normalize(snapshots(normalNeteaseFixture));
    const targets: ProjectionTarget[] = [
      targetFor("music.netease.identity", {
        medalLimit: 0,
        publicFields: ["display_name", "avatar", "level", "vip"]
      }),
      targetFor("music.netease.listening", {
        publicFields: ["total_count", "total_duration"]
      }),
      targetFor("music.netease.ranking", { publicLimit: 10, range: "all_time" }),
      targetFor("music.netease.social", { publicLimit: 0, publicLists: [] }),
      targetFor("music.netease.playlists", { publicLimit: 2 }),
      targetFor("music.netease.showcase", { source: "all_time_track" }),
      targetFor(
        "music.netease.ranking",
        { publicLimit: 100, publicRanges: ["week", "all_time"] },
        2
      ),
      targetFor("music.netease.showcase", { mode: "provider" }, 2),
      targetFor(
        "music.netease.showcase",
        {
          mode: "custom",
          selections: [
            { resourceId: "20001", source: "weekly_track" },
            { resourceId: "20002", source: "all_time_track" },
            { resourceId: "13001", source: "created_playlist" },
            { resourceId: "medal-1", source: "medal" },
            { resourceId: "total", source: "listening_duration" },
            { resourceId: "91002", source: "provider_music_card" },
            { resourceId: "20003", source: "weekly_track" }
          ]
        },
        2
      ),
      targetFor("music.netease.showcase", { mode: "custom", selections: [] }, 2),
      targetFor(
        "music.netease.showcase",
        {
          mode: "custom",
          selections: [
            { resourceId: "20001", source: "unknown_source" },
            { resourceId: "20001", source: "weekly_track" },
            { resourceId: "20001", source: "weekly_track" }
          ]
        },
        2
      ),
      targetFor("music.netease.calendar", { publicRanges: ["week", "month"] })
    ];
    const projections = await project(normalized, targets);
    const identity = projections[0]!.data as JsonObject;
    expect(identity).toMatchObject({
      profile: {
        avatarUrl: "https://p1.music.126.net/sanitized-fixture/avatar.jpg",
        displayName: "Nivalis Fixture",
        level: 10
      },
      vip: { availability: "available", redVipLevel: 6 }
    });
    expect(JSON.stringify(identity)).not.toContain("Music is the place");
    expect(JSON.stringify(identity)).not.toContain("providerUserId");
    expect(projections[1]!.data).toMatchObject({
      totalListeningDuration: { availability: "available", unit: "seconds", value: 582420 }
    });
    expect(projections[2]!.data).toMatchObject({ range: "all_time", totalAvailable: 2 });
    expect(projections[3]!.data).toMatchObject({
      followers: { availability: "unavailable", reason: "not_public" },
      following: { availability: "unavailable", reason: "not_public" }
    });
    expect(projections[4]!.data).toMatchObject({ items: [{ name: "Snow Archive" }] });
    expect(projections[2]!.data).toMatchObject({
      webUrl: "https://music.163.com/user/songs/rank?id=10001"
    });
    expect(projections[3]!.data).toMatchObject({
      webUrl: "https://music.163.com/user/home?id=10001"
    });
    expect(projections[4]!.data).toMatchObject({
      items: [expect.objectContaining({ webUrl: "https://music.163.com/playlist?id=13001" })]
    });
    expect(projections[5]!.data).toMatchObject({
      availability: "available",
      card: { kind: "track", track: { name: "Snow Light" } }
    });
    expect(projections[6]!.data).toMatchObject({
      allTime: { availability: "available", totalAvailable: 2 },
      publicRanges: ["week", "all_time"],
      week: { availability: "available", totalAvailable: 3 }
    });
    expect(projections[7]!.data).toMatchObject({
      availability: "available",
      items: [
        {
          card: {
            creativeType: "EXHIBITION_CARD",
            cardKind: "ranking",
            kind: "provider_music_card",
            resourceType: "song_rank",
            jumpUrl: "https://music.163.com/user/songs/rank?id=10001",
            title: "听歌排行"
          }
        },
        {
          card: {
            artists: [{ name: "Aimer", providerArtistId: "30001" }],
            cardKind: "song",
            jumpUrl: "https://music.163.com/song?id=20001",
            title: "Window Song 1"
          }
        },
        { card: { cardKind: "song", title: "Window Song 2" } },
        { card: { cardKind: "song", title: "Window Song 3" } },
        { card: { cardKind: "song", title: "Window Song 4" } },
        { card: { cardKind: "song", title: "Window Song 5" } }
      ],
      maxItems: 6,
      mode: "provider"
    });
    expect((projections[8]!.data as JsonObject).items).toHaveLength(6);
    expect(projections[8]!.data).toMatchObject({
      availability: "available",
      items: [
        { card: { kind: "track" }, source: "weekly_track" },
        { card: { kind: "track" }, source: "all_time_track" },
        { card: { kind: "playlist" }, source: "created_playlist" },
        { card: { kind: "medal" }, source: "medal" },
        { card: { kind: "duration" }, source: "listening_duration" },
        { card: { kind: "provider_music_card" }, source: "provider_music_card" }
      ],
      maxItems: 6,
      mode: "custom"
    });
    expect((projections[9]!.data as JsonObject).items).toEqual([]);
    expect((projections[10]!.data as JsonObject).items).toMatchObject([
      { resourceId: "20001", source: "weekly_track" }
    ]);
    expect(projections[11]!.data).toMatchObject({
      month: {
        availability: "available",
        coverage: "provider_month",
        points: expect.arrayContaining([
          expect.objectContaining({ date: "2026-04-01", minutes: 0 })
        ])
      },
      publicRanges: ["week", "month"],
      week: {
        availability: "available",
        coverage: "provider_week",
        points: expect.arrayContaining([
          expect.objectContaining({ date: "2026-04-20", minutes: 10 })
        ])
      }
    });

    const catalog = buildNeteaseOwnerDataCatalog(normalized.data as NeteaseNormalizedPayload);
    expect(catalog.listening).toMatchObject({
      monthlyListenDays: 25,
      monthlyTrend: expect.arrayContaining([
        expect.objectContaining({ label: "2026-04-01", minutes: 0 })
      ]),
      weeklyListenDays: 3
    });
    expect(catalog.listening).toMatchObject({ totalDurationSeconds: 582420 });
    expect(catalog.allTimeRanking).toEqual(
      expect.arrayContaining([expect.objectContaining({ rank: 1 })])
    );
    expect(catalog.weeklyRanking).toEqual(
      expect.arrayContaining([expect.objectContaining({ rank: 1 })])
    );
    expect(catalog.musicCards).toMatchObject({
      items: [
        expect.objectContaining({
          cardKind: "ranking",
          creativeType: "EXHIBITION_CARD",
          providerCardId: "91001",
          resourceType: "song_rank"
        }),
        expect.objectContaining({
          cardKind: "song",
          providerCardId: "91002",
          resourceId: "20001"
        }),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      ],
      sourceAvailability: "available"
    });
    expect((catalog.musicCards as JsonObject).items).toHaveLength(6);
    expect(catalog.createdPlaylists).toMatchObject({
      items: [expect.objectContaining({ name: "Snow Archive" })],
      providerTotal: 2
    });
    expect(JSON.stringify(catalog.createdPlaylists)).not.toContain("Private Fixture Playlist");
    expect(JSON.stringify(catalog)).not.toMatch(/lastLoginIP|MUSIC_U|authorization/i);
  });

  it("distinguishes a valid empty account from partial availability", async () => {
    const empty = await normalize(snapshots(emptyNeteaseFixture));
    const [emptyProjection] = await project(empty, [target("7d")]);
    expect(emptyProjection?.data).toMatchObject({
      listeningDuration: { availability: "unavailable", reason: "provider_omitted" },
      totalListenCount: { availability: "available", value: 0 },
      weeklyListening: { availability: "available", rankedPlayCount: 0 }
    });
    expect(empty.data).toMatchObject({ musicCards: [], musicCardsAvailable: true });

    const partial = await normalize(snapshots(partialNeteaseFixture));
    const [partialProjection] = await project(partial, [target("30d")]);
    expect(partialProjection?.data).toMatchObject({
      listeningDuration: { availability: "unavailable", reason: "provider_omitted" },
      weeklyListening: { availability: "unavailable", reason: "insufficient_coverage" }
    });
  });

  it("projects following and followers as independent Widget instances", async () => {
    const normalized = await normalize(snapshots(normalNeteaseFixture));
    const projections = await project(normalized, [
      targetFor("music.netease.social", {
        publicLimit: 8,
        publicLists: ["following"],
        view: "following"
      }),
      targetFor("music.netease.social", {
        publicLimit: 8,
        publicLists: ["followers"],
        view: "followers"
      })
    ]);

    expect(projections[0]?.data).toMatchObject({
      followers: { availability: "unavailable", reason: "not_public" },
      following: { availability: "available" },
      followingWebUrl: "https://music.163.com/user/follows?id=10001",
      view: "following"
    });
    expect(projections[1]?.data).toMatchObject({
      followers: { availability: "available" },
      followersWebUrl: "https://music.163.com/user/fans?id=10001",
      following: { availability: "unavailable", reason: "not_public" },
      view: "followers"
    });
  });

  it("keeps historical Raw Snapshot replay compatible before the showcase endpoint existed", async () => {
    const historical = snapshots(normalNeteaseFixture).filter(
      (snapshot) =>
        snapshot.sourceKind !== NETEASE_SOURCE.profileShowcase &&
        snapshot.sourceKind !== NETEASE_SOURCE.profileMusicCards &&
        snapshot.sourceKind !== NETEASE_SOURCE.musicCardTracks
    );
    const normalized = await normalize(historical);
    expect(normalized.data).toMatchObject({
      musicCards: [expect.objectContaining({ creativeType: "legacy" })],
      musicCardsAvailable: true
    });
  });

  it("merges profile music cards across immutable Raw pages without losing Provider order", async () => {
    const raw = snapshots(normalNeteaseFixture).filter(
      (snapshot) => snapshot.sourceKind !== NETEASE_SOURCE.profileMusicCards
    );
    const profileIndex = raw.findIndex(
      (snapshot) => snapshot.sourceKind === NETEASE_SOURCE.profileShowcase
    );
    const profile = raw[profileIndex]!;
    const payload = profile.payload as JsonObject;
    const data = payload.data as JsonObject;
    const blocks = data.blocks as JsonObject[];
    raw[profileIndex] = {
      ...profile,
      payload: {
        ...payload,
        data: {
          ...data,
          blocks: blocks.slice(0, 3),
          cursor: { PERSONAL_USER_SHOWCASE: "next-page" },
          hasMore: true
        }
      }
    };
    raw.push({
      ...profile,
      id: "00000000-0000-4000-8000-000000000698",
      payload: {
        ...payload,
        data: {
          ...data,
          blocks: blocks.slice(3),
          cursor: { PERSONAL_USER_SHOWCASE: "-1" },
          hasMore: false
        }
      },
      sourceCursor: JSON.stringify({ PERSONAL_USER_SHOWCASE: "next-page" }),
      sourceKind: `${NETEASE_SOURCE.profileShowcase}.page.1`
    });

    const normalized = await normalize(raw);
    const cards = (normalized.data as NeteaseNormalizedPayload).musicCards;
    expect(cards).toHaveLength(10);
    expect(cards.map((card) => card.sourceBlockType)).toEqual([
      "MUSIC_TASTE_WITH_MORE",
      "MUSIC_TASTE_WITH_MORE",
      "MUSIC_TASTE_WITH_MORE",
      "SONG_LIST",
      "PERSONAL_ALBUM_RACK",
      "PLAYLIST_LIST_WITH_MORE",
      "PERSONAL_SHOWCASE",
      "PERSONAL_SHOWCASE",
      "PERSONAL_SHOWCASE",
      "PERSONAL_SHOWCASE"
    ]);
    expect(normalized.meta.sourceSnapshots).toEqual(
      expect.arrayContaining([
        {
          partition: { kind: "singleton" },
          snapshotId: profile.id,
          source: NETEASE_SOURCE.profileShowcase
        },
        {
          partition: { index: 1, kind: "index" },
          snapshotId: "00000000-0000-4000-8000-000000000698",
          source: NETEASE_SOURCE.profileShowcase
        }
      ])
    );
  });

  it("deduplicates repeated Provider list pages and never marks partial coverage complete", async () => {
    const fixture = {
      ...normalNeteaseFixture,
      [NETEASE_SOURCE.followers]: {
        ...normalNeteaseFixture[NETEASE_SOURCE.followers],
        more: true,
        size: 128
      }
    };
    const raw = snapshots(fixture);
    raw.push({
      ...raw.find((snapshot) => snapshot.sourceKind === NETEASE_SOURCE.followers)!,
      id: "00000000-0000-4000-8000-000000000699",
      sourceKind: `${NETEASE_SOURCE.followers}.page.1`
    });
    const normalized = await normalize(raw);
    const payload = normalized.data as NeteaseNormalizedPayload;
    expect(payload.followers.items).toHaveLength(1);
    expect(payload.followers.providerTotal).toBe(128);
    expect(payload.followers.complete).toBe(false);
  });

  it.each([
    ["renamed field", schemaDriftFixture],
    ["missing required field", missingFieldFixture],
    ["unknown enum", unknownEnumFixture],
    ["unknown showcase creative", showcaseSchemaDriftFixture]
  ])("surfaces %s as ProviderSchemaMismatch rather than fake zero data", async (_name, fixture) => {
    await expect(normalize(snapshots(fixture))).rejects.toBeInstanceOf(ProviderSchemaMismatchError);
  });

  it("rejects a monthly report mislabeled as a weekly period", async () => {
    const monthly = normalNeteaseFixture[NETEASE_SOURCE.listenReportMonth];
    await expect(
      normalize(
        snapshots({
          ...normalNeteaseFixture,
          [NETEASE_SOURCE.listenReportMonth]: {
            ...monthly,
            data: {
              ...((monthly.data as JsonObject) ?? {}),
              type: "week"
            }
          }
        })
      )
    ).rejects.toMatchObject({ sourceKind: NETEASE_SOURCE.listenReportMonth });
  });

  it("handles the sanitized large fixture without changing its bounded projection", async () => {
    const normalized = await normalize(snapshots(largeNeteaseFixture));
    const [projection] = await project(normalized, [target("7d")]);
    const weekly = (projection!.data as JsonObject).weeklyListening as JsonObject;
    expect(weekly.topTracks).toHaveLength(100);
    expect(weekly.topArtists).toHaveLength(5);
  });

  it("keeps all Top 100 rows when the Owner explicitly publishes the complete ranking", async () => {
    const normalized = await normalize(snapshots(largeNeteaseFixture));
    const [projection] = await project(normalized, [
      targetFor(
        "music.netease.ranking",
        { publicLimit: 100, publicRanges: ["week", "all_time"] },
        2
      )
    ]);
    const ranking = projection!.data as JsonObject;
    expect(ranking.publicLimit).toBe(100);
    expect((ranking.week as JsonObject).items).toHaveLength(100);
  });

  it("keeps weekly and monthly calendar visibility behind explicit publicRanges", async () => {
    const normalized = await normalize(snapshots(normalNeteaseFixture));
    const [projection] = await project(normalized, [
      targetFor("music.netease.calendar", { publicRanges: ["month"] })
    ]);
    expect(projection!.data).toMatchObject({
      month: { availability: "available", coverage: "provider_month" },
      publicRanges: ["month"],
      week: { availability: "unavailable", reason: "not_public" }
    });
  });

  it("projects Provider-ordered weekly and monthly record walls with previous-week fallback data", async () => {
    const normalized = await normalize([
      ...snapshots(normalNeteaseFixture),
      historySnapshot(NETEASE_SOURCE.listenReportPreviousWeek, "week", 1, 900),
      historySnapshot(NETEASE_SOURCE.listenReportPreviousWeek, "week", 2, 901),
      historySnapshot(NETEASE_SOURCE.listenReportPreviousMonth, "month", 1, 902),
      historySnapshot(NETEASE_SOURCE.listenReportPreviousMonth, "month", 2, 903)
    ]);
    const payload = normalized.data as NeteaseNormalizedPayload;
    expect(payload.weeklyRecordWall?.items).toHaveLength(20);
    expect(payload.monthlyRecordWall?.items).toHaveLength(20);
    expect(payload.weeklyRecordWall?.items[0]).toMatchObject({
      name: "Fixture week song 1",
      providerTrackId: "22001"
    });
    expect(payload.previousWeeklyReport?.points).toHaveLength(7);
    expect(payload.previousMonthlyReport?.points).toHaveLength(31);
    expect(payload.weeklyHistory).toHaveLength(3);
    expect(payload.monthlyHistory).toHaveLength(3);
    expect(payload.weeklyHistory.every((history) => history.recordWall?.items.length === 20)).toBe(
      true
    );
    expect(payload.monthlyHistory.every((history) => history.recordWall?.items.length === 20)).toBe(
      true
    );
    expect(payload.monthlyRecordWall?.items.at(-1)).toMatchObject({
      name: null,
      providerTrackId: null
    });

    const [projection] = await project(normalized, [
      targetFor("music.netease.calendar", { publicRanges: ["week", "month"] })
    ]);
    expect(projection!.data).toMatchObject({
      month: {
        recordWall: {
          availability: "available",
          coverage: "provider_month_rank",
          ordering: "provider",
          songCount: 48,
          items: expect.arrayContaining([
            expect.objectContaining({ name: null, providerTrackId: null, webUrl: null })
          ])
        }
      },
      previousWeek: {
        availability: "available",
        points: expect.arrayContaining([{ date: "2026-04-13", minutes: 0 }])
      },
      previousMonth: {
        availability: "available",
        points: expect.arrayContaining([{ date: "2026-03-01", minutes: 0 }])
      },
      weekHistory: expect.arrayContaining([
        expect.objectContaining({
          recordWall: expect.objectContaining({ availability: "available" })
        })
      ]),
      monthHistory: expect.arrayContaining([
        expect.objectContaining({
          recordWall: expect.objectContaining({ availability: "available" })
        })
      ]),
      week: {
        recordWall: {
          availability: "available",
          coverage: "provider_week_rank",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "Fixture week song 1",
              webUrl: "https://music.163.com/song?id=22001"
            })
          ])
        }
      }
    });
  });

  it("replays pre-record-wall Raw snapshots without inventing covers or previous-week data", async () => {
    const legacy = snapshots(normalNeteaseFixture).filter(
      (snapshot) =>
        snapshot.sourceKind !== NETEASE_SOURCE.listenRankWeek &&
        snapshot.sourceKind !== NETEASE_SOURCE.listenRankMonth &&
        snapshot.sourceKind !== NETEASE_SOURCE.listenReportPreviousWeek &&
        snapshot.sourceKind !== NETEASE_SOURCE.listenReportPreviousMonth
    );
    const normalized = await normalize(legacy);
    const payload = normalized.data as NeteaseNormalizedPayload;
    expect(payload.weeklyRecordWall).toBeNull();
    expect(payload.monthlyRecordWall).toBeNull();
    expect(payload.previousWeeklyReport).toBeNull();
    expect(payload.previousMonthlyReport).toBeNull();
    expect(payload.weeklyHistory).toEqual([]);
    expect(payload.monthlyHistory).toEqual([]);
    const [projection] = await project(normalized, [
      targetFor("music.netease.calendar", { publicRanges: ["week", "month"] })
    ]);
    expect(projection!.data).toMatchObject({
      month: { recordWall: { availability: "unavailable", reason: "provider_omitted" } },
      previousWeek: { availability: "unavailable", reason: "provider_omitted" },
      previousMonth: { availability: "unavailable", reason: "provider_omitted" },
      week: { recordWall: { availability: "unavailable", reason: "provider_omitted" } }
    });
  });

  it("keeps the credential in the transport boundary and emits sanitized Provider payloads", async () => {
    const requests: Request[] = [];
    const providerFetcher = createNeteaseHttpFixtureFetcher("normal");
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return providerFetcher(request);
    });
    const connector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, fetcher),
      { resolve: async () => secret },
      () => fetchedAt
    );
    const results = await collect(connector);

    expect(results.map((result) => result.meta.source)).toEqual([
      NETEASE_SOURCE.account,
      NETEASE_SOURCE.userDetail,
      NETEASE_SOURCE.profileHome,
      NETEASE_SOURCE.profileShowcase,
      NETEASE_SOURCE.profileMusicCards,
      NETEASE_SOURCE.musicCardTracks,
      NETEASE_SOURCE.userLevel,
      NETEASE_SOURCE.vipInfo,
      NETEASE_SOURCE.listenTotal,
      NETEASE_SOURCE.weeklyRecord,
      NETEASE_SOURCE.allTimeRecord,
      NETEASE_SOURCE.recentSongs,
      NETEASE_SOURCE.listenReportWeek,
      NETEASE_SOURCE.listenReportPreviousWeek,
      NETEASE_SOURCE.listenReportPreviousWeek,
      NETEASE_SOURCE.listenReportPreviousWeek,
      NETEASE_SOURCE.listenReportMonth,
      NETEASE_SOURCE.listenReportPreviousMonth,
      NETEASE_SOURCE.listenReportPreviousMonth,
      NETEASE_SOURCE.listenReportPreviousMonth,
      NETEASE_SOURCE.listenRankWeek,
      NETEASE_SOURCE.listenRankMonth,
      NETEASE_SOURCE.following,
      NETEASE_SOURCE.followers,
      NETEASE_SOURCE.createdPlaylists,
      NETEASE_SOURCE.medals,
      NETEASE_SOURCE.socialStatus
    ]);
    expect(
      results
        .filter((result) => result.meta.source === NETEASE_SOURCE.listenReportPreviousWeek)
        .map((result) => result.meta.partition)
    ).toEqual([
      { index: 0, kind: "index" },
      { index: 1, kind: "index" },
      { index: 2, kind: "index" }
    ]);
    expect(JSON.stringify(results)).not.toContain(secret);
    expect(requests).toHaveLength(27);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(["music.163.com", "interface.music.163.com", "interface3.music.163.com"]).toContain(
        new URL(request.url).hostname
      );
      expect(request.headers.get("cookie")).toContain(`MUSIC_U=${secret}`);
      expect(request.headers.has("x-real-ip")).toBe(false);
      expect(request.headers.has("authorization")).toBe(false);
    }

    const historicalRequests = requests.filter((request) =>
      new URL(request.url).pathname.endsWith("listen/data/report")
    );
    const historicalBodies = await Promise.all(historicalRequests.map(decodeEapiRequest));
    expect(historicalBodies).toMatchObject([
      {
        endTime: reportStartTime(normalNeteaseFixture[NETEASE_SOURCE.listenReportWeek]) - 1,
        type: "week"
      },
      { endTime: reportStartTime(historicalListenReportFixture("week", 0)) - 1, type: "week" },
      { endTime: reportStartTime(historicalListenReportFixture("week", 1)) - 1, type: "week" },
      {
        endTime: reportStartTime(normalNeteaseFixture[NETEASE_SOURCE.listenReportMonth]) - 1,
        type: "month"
      },
      {
        endTime: reportStartTime(historicalListenReportFixture("month", 0)) - 1,
        type: "month"
      },
      {
        endTime: reportStartTime(historicalListenReportFixture("month", 1)) - 1,
        type: "month"
      }
    ]);

    const showcaseRequest = requests.find((request) =>
      new URL(request.url).pathname.includes("personal/home/page/user")
    );
    expect(showcaseRequest?.headers.get("user-agent")).toContain("NeteaseMusic/9.5.70");
    expect(showcaseRequest?.headers.get("cookie")).toContain("os=android");
    expect(showcaseRequest?.headers.get("cookie")).toContain("appver=9.5.70");
    expect(showcaseRequest?.headers.get("cookie")).toContain("versioncode=9005070");
    expect(new URL(showcaseRequest!.url).hostname).toBe("interface3.music.163.com");
    const profilePageRequest = await decodeEapiRequest(showcaseRequest!);
    expect(profilePageRequest).toMatchObject({
      header: {
        appver: "9.5.70",
        os: "android",
        requestId: expect.any(String),
        versioncode: "9005070"
      },
      newStyle: true,
      userId: 10001
    });
    expect(profilePageRequest).not.toHaveProperty("cursor");

    const musicCardsRequest = requests.find((request) =>
      new URL(request.url).pathname.includes("user/page/window/get")
    );
    expect(musicCardsRequest).toBeDefined();
    expect(new URL(musicCardsRequest!.url).hostname).toBe("interface3.music.163.com");
    await expect(decodeEapiRequest(musicCardsRequest!)).resolves.toMatchObject({
      rnVersion: 1_786_085_676,
      userId: "10001"
    });
    const musicCardTracksRequest = requests.find((request) =>
      new URL(request.url).pathname.includes("v3/song/detail")
    );
    expect(musicCardTracksRequest).toBeDefined();
    expect(new URL(musicCardTracksRequest!.url).hostname).toBe("music.163.com");

    const profileHomeRequest = requests.find((request) =>
      new URL(request.url).pathname.includes("w/v1/user/detail")
    );
    expect(profileHomeRequest?.headers.get("user-agent")).toContain("Mozilla/5.0");
    expect(profileHomeRequest?.headers.get("cookie")).toContain("os=pc");
  });

  it("bounds independent Provider reads without parallelizing pagination or history chains", async () => {
    const providerFetcher = createNeteaseHttpFixtureFetcher("normal");
    let inFlight = 0;
    let maximumInFlight = 0;
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      try {
        return await providerFetcher(input, init);
      } finally {
        inFlight -= 1;
      }
    });
    const connector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, fetcher),
      { resolve: async () => secret },
      () => fetchedAt,
      99
    );

    const results = await collect(connector);

    expect(maximumInFlight).toBe(4);
    expect(results).toHaveLength(27);
    expect(results.filter((result) => result.meta.source.includes("listen_report"))).toHaveLength(
      8
    );
  });

  it("reuses only a complete contiguous immutable history window", async () => {
    const firstConnector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, createNeteaseHttpFixtureFetcher("normal")),
      { resolve: async () => secret },
      () => fetchedAt,
      3
    );
    const first = await collect(firstConnector);
    const cachedHistory = first.filter(
      (result) =>
        result.meta.source.startsWith(NETEASE_SOURCE.listenReportPreviousWeek) ||
        result.meta.source.startsWith(NETEASE_SOURCE.listenReportPreviousMonth)
    );
    expect(cachedHistory).toHaveLength(6);

    const reusedRequests: Request[] = [];
    const reusedFixture = createNeteaseHttpFixtureFetcher("normal");
    const reusedConnector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, async (input, init) => {
        reusedRequests.push(new Request(input, init));
        return reusedFixture(input, init);
      }),
      { resolve: async () => secret },
      () => fetchedAt,
      3
    );
    const reused = await collect(reusedConnector, cachedHistory);
    expect(
      reusedRequests.filter((request) =>
        new URL(request.url).pathname.endsWith("listen/data/report")
      )
    ).toHaveLength(0);
    expect(
      reused.filter((result) => cachedHistory.some((cached) => cached.data === result.data))
    ).toHaveLength(6);

    const incompleteRequests: Request[] = [];
    const incompleteFixture = createNeteaseHttpFixtureFetcher("normal");
    const incompleteConnector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, async (input, init) => {
        incompleteRequests.push(new Request(input, init));
        return incompleteFixture(input, init);
      }),
      { resolve: async () => secret },
      () => fetchedAt,
      3
    );
    await collect(incompleteConnector, cachedHistory.slice(0, 5));
    expect(
      incompleteRequests.filter((request) =>
        new URL(request.url).pathname.endsWith("listen/data/report")
      )
    ).toHaveLength(3);
  });

  it("follows Provider profile cursors only after hasMore and preserves every page as Raw evidence", async () => {
    const profileRequests: Request[] = [];
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init);
      const pathname = new URL(request.url).pathname;
      if (pathname.includes("personal/home/page/user")) {
        profileRequests.push(request);
        return Response.json(
          profileRequests.length === 1
            ? {
                code: 200,
                data: {
                  blocks: [{ creatives: [], showType: "MUSIC_TASTE_WITH_MORE" }],
                  cursor: JSON.stringify({ PERSONAL_USER_SHOWCASE: "next-page" }),
                  hasMore: true
                }
              }
            : {
                code: 200,
                data: {
                  blocks: [{ creatives: [], showType: "SONG_LIST" }],
                  cursor: { PERSONAL_USER_SHOWCASE: "-1" },
                  hasMore: false
                }
              }
        );
      }
      return Response.json(payloadForPath(pathname));
    });
    const connector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, fetcher),
      { resolve: async () => secret },
      () => fetchedAt
    );

    const results = await collect(connector);
    const profileSnapshots = results.filter((result) =>
      result.meta.source.startsWith(NETEASE_SOURCE.profileShowcase)
    );
    expect(profileSnapshots.map((result) => result.meta.source)).toEqual([
      NETEASE_SOURCE.profileShowcase,
      NETEASE_SOURCE.profileShowcase
    ]);
    expect(profileSnapshots[0]?.meta.partition).toEqual({
      cursor: null,
      index: 0,
      kind: "cursor"
    });
    expect(profileSnapshots[1]?.meta.partition).toEqual({
      cursor: JSON.stringify({ PERSONAL_USER_SHOWCASE: "next-page" }),
      index: 1,
      kind: "cursor"
    });
    expect(profileRequests).toHaveLength(2);
    const firstRequest = await decodeEapiRequest(profileRequests[0]!);
    const secondRequest = await decodeEapiRequest(profileRequests[1]!);
    expect(firstRequest).not.toHaveProperty("cursor");
    expect(secondRequest).toMatchObject({
      cursor: JSON.stringify({ PERSONAL_USER_SHOWCASE: "next-page" }),
      newStyle: true,
      userId: 10001
    });
  });

  it("rejects a repeated profile cursor instead of looping or committing a partial projection", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const pathname = new URL(new Request(input, init).url).pathname;
      if (pathname.includes("personal/home/page/user")) {
        return Response.json({
          code: 200,
          data: {
            blocks: [{ creatives: [], showType: "MUSIC_TASTE_WITH_MORE" }],
            cursor: JSON.stringify({ PERSONAL_USER_SHOWCASE: "same-page" }),
            hasMore: true
          }
        });
      }
      return Response.json(payloadForPath(pathname));
    });
    const connector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, fetcher),
      { resolve: async () => secret },
      () => fetchedAt
    );

    await expect(collect(connector)).rejects.toBeInstanceOf(ProviderSchemaMismatchError);
  });

  it("exposes the read-only profile tab capability", async () => {
    let captured: Request | null = null;
    const client = new NeteaseClient({ timeoutMs: 2_000 }, async (input, init) => {
      captured = new Request(input, init);
      return Response.json({
        code: 200,
        data: {
          tabs: [
            { tabInfo: { title: "主页" }, tabName: "main" },
            { tabInfo: { title: "声音" }, tabName: "voice" }
          ]
        }
      });
    });

    await expect(client.getProfileHomeTabs(secret, "10001")).resolves.toMatchObject({
      data: { tabs: [{ tabName: "main" }, { tabName: "voice" }] }
    });
    expect(captured).not.toBeNull();
    expect(new URL(captured!.url).pathname).toContain("personal/home/page/tabs");
    await expect(decodeEapiRequest(captured!)).resolves.toMatchObject({ userId: 10001 });
  });

  it("invokes the default Fetch transport with the runtime global receiver", async () => {
    const receivers: unknown[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async function (
      this: typeof globalThis,
      _input: RequestInfo | URL,
      init?: RequestInit
    ) {
      receivers.push(this);
      expect(init?.redirect).toBe("manual");
      return Response.json(normalNeteaseFixture[NETEASE_SOURCE.account]);
    });

    try {
      await expect(
        new NeteaseClient({ timeoutMs: 2_000 }).getAccount(secret)
      ).resolves.toMatchObject({ code: 200 });
      expect(receivers).toEqual([globalThis]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("classifies credential and transient failures without retry ambiguity", async () => {
    const expired = new NeteaseClient({ timeoutMs: 2_000 }, async () =>
      Response.json({ code: 301, message: "login required" })
    );
    await expect(expired.getAccount(secret)).rejects.toBeInstanceOf(ProviderCredentialError);

    const unavailable = new NeteaseClient(
      { timeoutMs: 2_000 },
      async () => new Response("unavailable", { status: 503 })
    );
    await expect(unavailable.getAccount(secret)).rejects.toBeInstanceOf(RetryableProviderError);
  });

  it("keeps every committed fixture free of credential-like keys", () => {
    for (const fixture of [
      normalNeteaseFixture,
      emptyNeteaseFixture,
      partialNeteaseFixture,
      schemaDriftFixture,
      missingFieldFixture,
      unknownEnumFixture,
      largeNeteaseFixture
    ]) {
      expect(JSON.stringify(fixture)).not.toMatch(
        /(?:authorization|cookie|music_u|csrf|access.?token|refresh.?token|api.?key|secret|password)/i
      );
    }
  });

  it("removes credential-bearing keys before a Provider payload can become Raw evidence", () => {
    const sanitized = sanitizeNeteasePayload({
      account: { id: 1 },
      authorization: "private",
      code: 200,
      cookieString: "MUSIC_U=private; os=android",
      nested: { access_token: "private", keep: "evidence", tokenVersion: 3 },
      MUSIC_U: "private",
      targetUrl: "orpheus://song/20001?token=private&source=profile"
    });
    expect(sanitized).toEqual({
      account: { id: 1 },
      code: 200,
      cookieString: "[redacted]",
      nested: { keep: "evidence", tokenVersion: 3 },
      targetUrl: "orpheus://song/20001?source=profile"
    });
  });

  it.skipIf(
    process.env.NETEASE_INTEGRATION_TEST !== "1" || !process.env.NETEASE_INTEGRATION_MUSIC_U
  )(
    "optionally validates the real read-only Provider contract behind an explicit secret gate",
    async () => {
      const connector = new NeteaseConnector(new NeteaseClient({ timeoutMs: 10_000 }), {
        resolve: async () => process.env.NETEASE_INTEGRATION_MUSIC_U!
      });
      const fetched = await collect(connector);
      const normalized = await normalize(
        fetched.map((item, index) => ({
          createdAt: new Date(item.meta.collectedAt),
          fetchedAt: new Date(item.meta.collectedAt),
          id: `00000000-0000-4000-8000-${String(810 + index).padStart(12, "0")}`,
          payload: item.data,
          payloadHash: `${index}`.padStart(64, "0"),
          provider: "netease",
          providerConnectionId: connectionId,
          schemaVersion: item.meta.schemaVersion,
          sourceCursor: encodeProviderSourceContext(item, {
            checkpoint: null,
            issues: [],
            mode: "snapshot",
            outcome: "complete"
          }),
          sourceKind: item.meta.source,
          sourceTimestamp: item.meta.sourceUpdatedAt ? new Date(item.meta.sourceUpdatedAt) : null,
          syncRunId: syncRun().id
        }))
      );
      expect(normalized.meta.provider).toBe("netease");
    }
  );
});

function snapshots(fixture: Readonly<Record<NeteaseSourceKind, JsonObject>>): RawSnapshot[] {
  return Object.entries(fixture).map(([sourceKind, payload], index) => ({
    createdAt: fetchedAt,
    fetchedAt,
    id: `00000000-0000-4000-8000-${String(610 + index).padStart(12, "0")}`,
    payload,
    payloadHash: `${index}`.padStart(64, "0"),
    provider: "netease",
    providerConnectionId: connectionId,
    schemaVersion: 1,
    sourceCursor: null,
    sourceKind,
    sourceTimestamp: null,
    syncRunId: "00000000-0000-4000-8000-000000000601"
  }));
}

function historySnapshot(
  sourceKind: string,
  period: "month" | "week",
  index: number,
  id: number
): RawSnapshot {
  return {
    createdAt: fetchedAt,
    fetchedAt,
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    payload: historicalListenReportFixture(period, index),
    payloadHash: `${id}`.padStart(64, "0"),
    provider: "netease",
    providerConnectionId: connectionId,
    schemaVersion: 1,
    sourceCursor: null,
    sourceKind: `${sourceKind}.period.${index}`,
    sourceTimestamp: null,
    syncRunId: "00000000-0000-4000-8000-000000000601"
  };
}

function target(range: "7d" | "30d"): ProjectionTarget {
  return {
    dataConfig: { range },
    enabled: true,
    id: "00000000-0000-4000-8000-000000000701",
    presentationConfig: { showArtists: true, showTrend: true },
    projectionKey: "a".repeat(64),
    provider: "netease",
    schemaVersion: 2,
    title: "网易云音乐",
    type: "music.netease.overview"
  };
}

function targetFor(
  type: ProjectionTarget["type"],
  dataConfig: JsonObject,
  schemaVersion = 1
): ProjectionTarget {
  return {
    dataConfig,
    enabled: true,
    id: `00000000-0000-4000-8000-${String(720 + type.length).padStart(12, "0")}`,
    presentationConfig: {},
    projectionKey: type.padEnd(64, "a").slice(0, 64),
    provider: "netease",
    schemaVersion,
    title: type,
    type
  };
}

function syncRun(): SyncRun {
  return {
    attemptCount: 0,
    finishedAt: null,
    id: "00000000-0000-4000-8000-000000000601",
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "netease",
    providerConnectionId: connectionId,
    queueJobId: null,
    requestedAt: fetchedAt,
    startedAt: null,
    status: "queued"
  };
}

async function collect(
  connector: NeteaseConnector,
  cachedRecords: readonly ProviderSourceRecord[] = []
) {
  const run = syncRun();
  const result = await connector.collect(toProviderSyncRequest(run, { cachedRecords }));
  assertProviderCollection(result, NETEASE_PROVIDER_MANIFEST, run.id);
  return result.data.records;
}

function normalize(raw: readonly RawSnapshot[]) {
  const records = raw.map(toProviderSnapshotRecord);
  return new NeteaseNormalizer().normalize({
    data: {
      checkpoint: records[0]?.meta.checkpoint ?? null,
      collectionMode: records[0]?.meta.collectionMode ?? "snapshot",
      collectionOutcome: records[0]?.meta.collectionOutcome ?? "complete",
      issues: records[0]?.meta.issues ?? [],
      previous: null,
      records
    },
    meta: providerProtocolMetadata("normalization.request", "netease", syncRun().id)
  });
}

async function project(normalized: NormalizedProviderData, targets: readonly ProjectionTarget[]) {
  const result = await new NeteaseProjector().project({
    data: { normalized, targets },
    meta: providerProtocolMetadata("projection.request", "netease", syncRun().id)
  });
  return result.data;
}

function payloadForPath(pathname: string) {
  if (pathname.includes("account/get")) return normalNeteaseFixture[NETEASE_SOURCE.account];
  if (pathname.includes("w/v1/user/detail")) {
    return normalNeteaseFixture[NETEASE_SOURCE.profileHome];
  }
  if (pathname.includes("personal/home/page/user")) {
    return normalNeteaseFixture[NETEASE_SOURCE.profileShowcase];
  }
  if (pathname.includes("user/page/window/get")) {
    return normalNeteaseFixture[NETEASE_SOURCE.profileMusicCards];
  }
  if (pathname.includes("v3/song/detail")) {
    return normalNeteaseFixture[NETEASE_SOURCE.musicCardTracks];
  }
  if (pathname.includes("v1/user/detail")) {
    return normalNeteaseFixture[NETEASE_SOURCE.userDetail];
  }
  if (pathname.includes("user/level")) return normalNeteaseFixture[NETEASE_SOURCE.userLevel];
  if (pathname.includes("music-vip-membership")) {
    return normalNeteaseFixture[NETEASE_SOURCE.vipInfo];
  }
  if (pathname.includes("listen/data/total")) {
    return normalNeteaseFixture[NETEASE_SOURCE.listenTotal];
  }
  if (pathname.includes("play/record")) return normalNeteaseFixture[NETEASE_SOURCE.weeklyRecord];
  if (pathname.includes("song/list")) return normalNeteaseFixture[NETEASE_SOURCE.recentSongs];
  if (pathname.includes("realtime/report")) {
    return normalNeteaseFixture[NETEASE_SOURCE.listenReportWeek];
  }
  if (pathname.includes("song/play/rank")) {
    return normalNeteaseFixture[NETEASE_SOURCE.listenRankWeek];
  }
  if (pathname.endsWith("listen/data/report")) {
    return normalNeteaseFixture[NETEASE_SOURCE.listenReportPreviousWeek];
  }
  if (pathname.includes("user/getfollows/")) {
    return normalNeteaseFixture[NETEASE_SOURCE.following];
  }
  if (pathname.includes("user/getfolloweds/")) {
    return normalNeteaseFixture[NETEASE_SOURCE.followers];
  }
  if (pathname.includes("user/playlist/create")) {
    return normalNeteaseFixture[NETEASE_SOURCE.createdPlaylists];
  }
  if (pathname.includes("medal/user/page")) return normalNeteaseFixture[NETEASE_SOURCE.medals];
  if (pathname.includes("social/user/status")) {
    return normalNeteaseFixture[NETEASE_SOURCE.socialStatus];
  }
  return { code: 404 };
}

async function decodeEapiRequest(request: Request) {
  const body = new URLSearchParams(await request.text());
  const encrypted = body.get("params");
  if (!encrypted) throw new Error("Expected encrypted EAPI params.");
  const decipher = createDecipheriv(
    "aes-128-ecb",
    Buffer.from("e82ckenh8dichen8"),
    Buffer.alloc(0)
  );
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final()
  ]).toString();
  const [, json] = plaintext.split("-36cd479b6b5-");
  if (!json) throw new Error("Expected a signed EAPI payload.");
  return JSON.parse(json) as JsonObject;
}

function reportStartTime(payload: JsonObject) {
  const data = payload.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Expected a Provider report startTime fixture.");
  }
  const report = data as JsonObject;
  if (typeof report.startTime !== "number") {
    throw new Error("Expected a Provider report startTime fixture.");
  }
  return report.startTime;
}
