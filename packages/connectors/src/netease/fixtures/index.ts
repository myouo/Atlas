import type { JsonObject } from "@nivalis/domain";

import { NETEASE_SOURCE, type NeteaseSourceKind } from "../netease-types";

export type SanitizedNeteaseFixture = Readonly<Record<NeteaseSourceKind, JsonObject>>;
export type NeteaseHttpFixtureScenario = "normal" | "credential_expired" | "schema_drift";

export const normalNeteaseFixture: SanitizedNeteaseFixture = {
  [NETEASE_SOURCE.account]: {
    account: { id: 10001 },
    code: 200,
    profile: { nickname: "Nivalis Fixture", userId: 10001 }
  },
  [NETEASE_SOURCE.userLevel]: { code: 200, data: { level: 8, listenSongs: 6_421 } },
  [NETEASE_SOURCE.weeklyRecord]: {
    code: 200,
    weekData: [
      { playCount: 12, score: 100, song: track(20001, "Snow Light", 30001, "Aimer") },
      { playCount: 7, score: 74, song: track(20002, "Blue Hour", 30002, "Mizuki") },
      { playCount: 3, score: 42, song: track(20003, "Morning", 30001, "Aimer") }
    ]
  },
  [NETEASE_SOURCE.recentSongs]: {
    code: 200,
    data: {
      list: [
        {
          playTime: 1_777_000_000_000,
          resource: track(20001, "Snow Light", 30001, "Aimer"),
          resourceId: "20001"
        },
        {
          playTime: 1_776_999_000_000,
          resource: track(20002, "Blue Hour", 30002, "Mizuki"),
          resourceId: "20002"
        }
      ],
      total: 2
    }
  },
  [NETEASE_SOURCE.listenReportWeek]: {
    code: 200,
    data: {
      duration: 5_460,
      period: "week",
      points: [
        { duration: 600, label: "Mon" },
        { duration: 1_200, label: "Tue" },
        { duration: 3_660, label: "Wed" }
      ]
    }
  }
};

export const emptyNeteaseFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.userLevel]: { code: 200, data: { level: 1, listenSongs: 0 } },
  [NETEASE_SOURCE.weeklyRecord]: { code: 200, weekData: [] },
  [NETEASE_SOURCE.recentSongs]: { code: 200, data: { list: [], total: 0 } },
  [NETEASE_SOURCE.listenReportWeek]: { code: 200, data: {} }
};

export const partialNeteaseFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.listenReportWeek]: { code: 200, data: {} }
};

export const expiredCredentialFixture: JsonObject = {
  code: 301,
  message: "authentication required"
};

export const schemaDriftFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.weeklyRecord]: {
    code: 200,
    weekData: [{ play_count: 12, score: 100, song: track(20001, "Snow Light", 30001, "Aimer") }]
  }
};

export const missingFieldFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.userLevel]: { code: 200, data: { level: 8 } }
};

export const unknownEnumFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.listenReportWeek]: {
    code: 200,
    data: { duration: 600, period: "fortnight", points: [] }
  }
};

export const largeNeteaseFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.weeklyRecord]: {
    code: 200,
    weekData: Array.from({ length: 100 }, (_, index) => ({
      playCount: 100 - index,
      score: 100 - index,
      song: track(
        21000 + index,
        `Fixture Track ${index + 1}`,
        31000 + (index % 5),
        `Artist ${index % 5}`
      )
    }))
  }
};

export function createNeteaseHttpFixtureFetcher(
  scenario: NeteaseHttpFixtureScenario = "normal"
): typeof fetch {
  const fixture = scenario === "schema_drift" ? schemaDriftFixture : normalNeteaseFixture;
  let qrChecks = 0;
  let qrGeneration = 0;
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.includes("login/qrcode/unikey")) {
      qrChecks = 0;
      qrGeneration += 1;
      return Response.json(
        scenario === "schema_drift"
          ? { code: 200, unique_key: "drifted-fixture-key" }
          : { code: 200, unikey: `nivalis-sanitized-fixture-key-${qrGeneration}` }
      );
    }
    if (url.pathname.includes("login/qrcode/client/login")) {
      if (scenario === "credential_expired") return Response.json({ code: 800 });
      qrChecks += 1;
      if (qrChecks === 1) return Response.json({ code: 801 });
      if (qrChecks === 2) return Response.json({ code: 802 });
      return authSuccessResponse(803);
    }
    if (url.pathname.includes("sms/captcha/sent")) {
      return Response.json({ code: scenario === "credential_expired" ? 509 : 200 });
    }
    if (url.pathname.includes("login/cellphone")) {
      return scenario === "credential_expired"
        ? Response.json({ code: 502 })
        : authSuccessResponse();
    }
    if (scenario === "credential_expired") return Response.json(expiredCredentialFixture);
    if (url.pathname.includes("account/get")) {
      return Response.json(fixture[NETEASE_SOURCE.account]);
    }
    if (url.pathname.includes("user/level")) {
      return Response.json(fixture[NETEASE_SOURCE.userLevel]);
    }
    if (url.pathname.includes("play/record")) {
      return Response.json(fixture[NETEASE_SOURCE.weeklyRecord]);
    }
    if (url.pathname.includes("song/list")) {
      return Response.json(fixture[NETEASE_SOURCE.recentSongs]);
    }
    if (url.pathname.includes("realtime/report")) {
      return Response.json(fixture[NETEASE_SOURCE.listenReportWeek]);
    }
    return Response.json({ code: 404 }, { status: 404 });
  };
}

function authSuccessResponse(code = 200) {
  return Response.json(
    { code },
    {
      headers: {
        "set-cookie": "MUSIC_U=nivalis_fixture_music_u_credential; Path=/; HttpOnly; SameSite=Lax"
      }
    }
  );
}

function track(id: number, name: string, artistId: number, artistName: string): JsonObject {
  return {
    al: {
      id: id + 10_000,
      name: `Album ${id}`,
      picUrl: `https://p1.music.126.net/sanitized-fixture/${id}.jpg`
    },
    ar: [{ id: artistId, name: artistName }],
    dt: 240_000,
    id,
    name
  };
}
