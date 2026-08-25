import { createDecipheriv } from "node:crypto";

import {
  ProviderCredentialError,
  ProviderSchemaMismatchError,
  RetryableProviderError
} from "@nivalis/domain";
import type { JsonObject, ProjectionTarget, RawSnapshot, SyncRun } from "@nivalis/domain";
import { describe, expect, it, vi } from "vitest";

import {
  emptyNeteaseFixture,
  createNeteaseHttpFixtureFetcher,
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
import { NeteaseProjector, buildNeteaseOwnerDataCatalog } from "./netease-projector";
import {
  NETEASE_SOURCE,
  type NeteaseNormalizedPayload,
  type NeteaseSourceKind
} from "./netease-types";

const fetchedAt = new Date("2026-08-24T04:00:00.000Z");
const connectionId = "00000000-0000-4000-8000-000000000501";
const secret = "private-cookie-value-for-tests";

describe("NetEase Provider module", () => {
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
    const normalized = await new NeteaseNormalizer().normalize(snapshots(normalNeteaseFixture));
    const [projection] = await new NeteaseProjector().project(normalized, [target("7d")]);
    expect(projection?.projectionSchemaVersion).toBe(2);
    expect(projection?.data).toMatchObject({
      account: { availability: "available", providerUserId: "10001" },
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
        rankedPlayCount: 22
      }
    });
  });

  it("builds semantic cards and enforces public dataConfig allowlists server-side", async () => {
    const normalized = await new NeteaseNormalizer().normalize(snapshots(normalNeteaseFixture));
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
        { publicLimit: 12, publicRanges: ["week", "all_time"] },
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
            { resourceId: "native-card-song", source: "provider_music_card" },
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
      )
    ];
    const projections = await new NeteaseProjector().project(normalized, targets);
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
            cardKind: "song",
            creativeType: "SHOWCASE_GALLERY_FIX",
            kind: "provider_music_card",
            title: "最近循环最多"
          },
          resourceId: "native-card-song",
          source: "provider_music_card"
        },
        { card: { cardKind: "playlist", title: "我的宝藏歌单" } },
        { card: { creativeType: "SHOWCASE_LIST", textLines: ["累计 162 小时", "本周 91 分钟"] } },
        { card: { cardKind: "medal", title: "雪夜聆听者" } }
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

    const catalog = buildNeteaseOwnerDataCatalog(normalized.payload as NeteaseNormalizedPayload);
    expect(catalog.listening).toMatchObject({ totalDurationSeconds: 582420 });
    expect(catalog.allTimeRanking).toEqual(
      expect.arrayContaining([expect.objectContaining({ rank: 1 })])
    );
    expect(catalog.weeklyRanking).toEqual(
      expect.arrayContaining([expect.objectContaining({ rank: 1 })])
    );
    expect(catalog.musicCards).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          creativeType: "SHOWCASE_GALLERY_FIX",
          providerCardId: "native-card-song"
        })
      ]),
      sourceAvailability: "available"
    });
    expect(JSON.stringify(catalog)).not.toMatch(/lastLoginIP|MUSIC_U|authorization/i);
  });

  it("distinguishes a valid empty account from partial availability", async () => {
    const empty = await new NeteaseNormalizer().normalize(snapshots(emptyNeteaseFixture));
    const [emptyProjection] = await new NeteaseProjector().project(empty, [target("7d")]);
    expect(emptyProjection?.data).toMatchObject({
      listeningDuration: { availability: "unavailable", reason: "provider_omitted" },
      totalListenCount: { availability: "available", value: 0 },
      weeklyListening: { availability: "available", rankedPlayCount: 0 }
    });
    expect(empty.payload).toMatchObject({ musicCards: [], musicCardsAvailable: true });

    const partial = await new NeteaseNormalizer().normalize(snapshots(partialNeteaseFixture));
    const [partialProjection] = await new NeteaseProjector().project(partial, [target("30d")]);
    expect(partialProjection?.data).toMatchObject({
      listeningDuration: { availability: "unavailable", reason: "provider_omitted" },
      weeklyListening: { availability: "unavailable", reason: "insufficient_coverage" }
    });
  });

  it("keeps historical Raw Snapshot replay compatible before the showcase endpoint existed", async () => {
    const historical = snapshots(normalNeteaseFixture).filter(
      (snapshot) => snapshot.sourceKind !== NETEASE_SOURCE.profileShowcase
    );
    const normalized = await new NeteaseNormalizer().normalize(historical);
    expect(normalized.payload).toMatchObject({
      musicCards: [expect.objectContaining({ creativeType: "legacy" })],
      musicCardsAvailable: true
    });
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
    const normalized = await new NeteaseNormalizer().normalize(raw);
    const payload = normalized.payload as NeteaseNormalizedPayload;
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
    await expect(new NeteaseNormalizer().normalize(snapshots(fixture))).rejects.toBeInstanceOf(
      ProviderSchemaMismatchError
    );
  });

  it("handles the sanitized large fixture without changing its bounded projection", async () => {
    const normalized = await new NeteaseNormalizer().normalize(snapshots(largeNeteaseFixture));
    const [projection] = await new NeteaseProjector().project(normalized, [target("7d")]);
    const weekly = (projection!.data as JsonObject).weeklyListening as JsonObject;
    expect(weekly.topTracks).toHaveLength(100);
    expect(weekly.topArtists).toHaveLength(5);
  });

  it("keeps the credential in the transport boundary and emits sanitized Provider payloads", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return Response.json(payloadForPath(new URL(request.url).pathname));
    });
    const connector = new NeteaseConnector(
      new NeteaseClient({ timeoutMs: 2_000 }, fetcher),
      { resolve: async () => secret },
      () => fetchedAt
    );
    const results = await connector.fetch(syncRun());

    expect(results.map((result) => result.sourceKind)).toEqual([
      NETEASE_SOURCE.account,
      NETEASE_SOURCE.userDetail,
      NETEASE_SOURCE.profileHome,
      NETEASE_SOURCE.profileShowcase,
      NETEASE_SOURCE.userLevel,
      NETEASE_SOURCE.vipInfo,
      NETEASE_SOURCE.listenTotal,
      NETEASE_SOURCE.weeklyRecord,
      NETEASE_SOURCE.allTimeRecord,
      NETEASE_SOURCE.recentSongs,
      NETEASE_SOURCE.listenReportWeek,
      NETEASE_SOURCE.following,
      NETEASE_SOURCE.followers,
      NETEASE_SOURCE.createdPlaylists,
      NETEASE_SOURCE.medals,
      NETEASE_SOURCE.socialStatus
    ]);
    expect(JSON.stringify(results)).not.toContain(secret);
    expect(requests).toHaveLength(16);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(["music.163.com", "interface.music.163.com"]).toContain(new URL(request.url).hostname);
      expect(request.headers.get("cookie")).toContain(`MUSIC_U=${secret}`);
      expect(request.headers.has("x-real-ip")).toBe(false);
      expect(request.headers.has("authorization")).toBe(false);
    }

    const showcaseRequest = requests.find((request) =>
      new URL(request.url).pathname.includes("personal/home/page/user")
    );
    expect(showcaseRequest?.headers.get("user-agent")).toContain("NeteaseMusic/9.5.70");
    expect(showcaseRequest?.headers.get("cookie")).toContain("os=android");
    expect(showcaseRequest?.headers.get("cookie")).toContain("appver=9.5.70");
    await expect(decodeEapiRequest(showcaseRequest!)).resolves.toMatchObject({
      header: { appver: "9.5.70", os: "android" },
      newStyle: true,
      userId: 10001
    });

    const profileHomeRequest = requests.find((request) =>
      new URL(request.url).pathname.includes("w/v1/user/detail")
    );
    expect(profileHomeRequest?.headers.get("user-agent")).toContain("Mozilla/5.0");
    expect(profileHomeRequest?.headers.get("cookie")).toContain("os=pc");
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
      const fetched = await connector.fetch(syncRun());
      const normalized = await new NeteaseNormalizer().normalize(
        fetched.map((item, index) => ({
          createdAt: item.fetchedAt,
          fetchedAt: item.fetchedAt,
          id: `00000000-0000-4000-8000-${String(810 + index).padStart(12, "0")}`,
          payload: item.payload,
          payloadHash: `${index}`.padStart(64, "0"),
          provider: "netease",
          providerConnectionId: connectionId,
          schemaVersion: item.schemaVersion,
          sourceCursor: item.sourceCursor ?? null,
          sourceKind: item.sourceKind,
          sourceTimestamp: item.sourceTimestamp ?? null,
          syncRunId: syncRun().id
        }))
      );
      expect(normalized.provider).toBe("netease");
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

function payloadForPath(pathname: string) {
  if (pathname.includes("account/get")) return normalNeteaseFixture[NETEASE_SOURCE.account];
  if (pathname.includes("w/v1/user/detail")) {
    return normalNeteaseFixture[NETEASE_SOURCE.profileHome];
  }
  if (pathname.includes("personal/home/page/user")) {
    return normalNeteaseFixture[NETEASE_SOURCE.profileShowcase];
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
