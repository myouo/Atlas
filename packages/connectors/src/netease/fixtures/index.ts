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
  [NETEASE_SOURCE.profileHome]: {
    code: 200,
    data: {
      musicCards: [
        {
          cardId: "fixture-card-1",
          cardType: "song",
          resource: track(20001, "Snow Light", 30001, "Aimer"),
          title: "最近最爱"
        }
      ]
    },
    level: 10,
    listenSongs: 6_421,
    profile: {
      avatarUrl: "http://p1.music.126.net/sanitized-fixture/avatar.jpg",
      nickname: "Nivalis Fixture",
      userId: 10001
    }
  },
  [NETEASE_SOURCE.profileMusicCards]: {
    code: 200,
    data: {
      cardLimit: 6,
      cardVOList: [
        {
          canEdit: false,
          cover: "https://p1.music.126.net/sanitized-fixture/ranking.jpg",
          extra: {},
          id: 91_001,
          jumpUrl: "orpheus://listenrank/10001",
          name: "听歌排行",
          resId: "",
          resType: "song_rank"
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          canEdit: true,
          cover: `https://p1.music.126.net/sanitized-fixture/window-song-${index + 1}.jpg`,
          extra: {},
          id: 91_002 + index,
          jumpUrl: `orpheus://song/${20_001 + index}`,
          name: `Window Song ${index + 1}`,
          resId: String(20_001 + index),
          resType: "song"
        }))
      ],
      open: true
    }
  },
  [NETEASE_SOURCE.musicCardTracks]: {
    code: 200,
    songs: [
      track(20_001, "Window Song 1", 30_001, "Aimer"),
      track(20_002, "Window Song 2", 30_002, "Kalafina"),
      track(20_003, "Window Song 3", 30_003, "ヨルシカ"),
      track(20_004, "Window Song 4", 30_004, "Lucia"),
      track(20_005, "Window Song 5", 30_005, "cheluce")
    ]
  },
  [NETEASE_SOURCE.profileShowcase]: {
    code: 200,
    data: {
      blocks: [
        { creatives: [], showType: "PROFILE_HEADER" },
        {
          code: "PERSONAL_MUSIC_TASTE",
          creatives: [
            {
              creativeId: "profile-favorite",
              creativeType: "MY_FAVORITE",
              resources: [
                {
                  resourceId: "favorite-music",
                  resourceType: "PLAYLIST",
                  visibleStatus: "ONLY_MYSELF_SEE",
                  uiElement: {
                    images: [
                      { imageUrl: "https://p1.music.126.net/sanitized-fixture/favorite.jpg" }
                    ],
                    labels: [{ text: "Provider Reported" }],
                    mainTitle: { title: "红心收藏" },
                    subTitles: [{ title: "999+ 首喜欢的音乐" }],
                    type: "nm.profilePage.commonColorCreative"
                  }
                }
              ]
            },
            {
              creativeId: "profile-listen-rank",
              creativeType: "LISTEN_RANK",
              resources: [
                {
                  resourceId: "listen-rank",
                  resourceType: "SONG_TOPLIST",
                  uiElement: {
                    mainTitle: { title: "听歌排行" },
                    subTitles: [{ title: "累计 162 小时" }],
                    type: "nm.profilePage.commonColorCreative"
                  }
                }
              ]
            },
            {
              creativeId: "profile-time-machine",
              creativeType: "TIME_MACHINE",
              resources: [
                {
                  resourceId: "time-machine",
                  resourceType: "TEXT",
                  uiElement: {
                    mainTitle: { title: "音乐时光机" },
                    subTitles: [{ title: "Provider 卡片" }],
                    type: "nm.profilePage.commonColorCreative"
                  }
                }
              ]
            }
          ],
          modulePosition: 1,
          showType: "MUSIC_TASTE_WITH_MORE",
          uiElement: { mainTitle: { title: "音乐品味" } }
        },
        {
          code: "PERSONAL_REPRESENT_SONG",
          creatives: [
            {
              creativeId: "profile-song",
              creativeType: "PROFILE_BLOCK_RESOURCE",
              resources: [
                {
                  action: { clickAction: { targetUrl: "orpheus://song/20001" } },
                  resourceId: "20001",
                  resourceType: "song_resource_type",
                  uiElement: {
                    images: [{ imageUrl: "https://p1.music.126.net/sanitized-fixture/20001.jpg" }],
                    mainTitle: { title: "Snow Light" },
                    subTitles: [{ title: "Aimer" }],
                    type: "nm.profilePage.song"
                  }
                }
              ]
            }
          ],
          modulePosition: 2,
          showType: "SONG_LIST"
        },
        {
          code: "PERSONAL_ALBUM_RACK_BLOCK",
          creatives: [
            {
              creativeId: "profile-album",
              creativeType: "PROFILE_BLOCK_RESOURCE",
              resources: [
                {
                  action: { clickAction: { targetUrl: "orpheus://album/40001" } },
                  resourceId: "40001",
                  resourceType: "albumrack_resource_type",
                  uiElement: {
                    images: [{ imageUrl: "https://p1.music.126.net/sanitized-fixture/album.jpg" }],
                    mainTitle: { title: "雪境收藏" },
                    subTitles: [{ title: "私藏专辑" }],
                    type: "nm.profilePage.albumrack"
                  }
                }
              ]
            }
          ],
          modulePosition: 3,
          showType: "PERSONAL_ALBUM_RACK"
        },
        {
          code: "PERSONAL_CREATE_PLAYLIST",
          creatives: [
            {
              creativeId: "profile-playlist",
              creativeType: "PROFILE_BLOCK_RESOURCE",
              resources: [
                {
                  action: { clickAction: { targetUrl: "orpheus://playlist/13001" } },
                  resourceId: "13001",
                  resourceType: "playlist_resource_type",
                  uiElement: {
                    images: [
                      { imageUrl: "https://p1.music.126.net/sanitized-fixture/playlist-1.jpg" }
                    ],
                    mainTitle: { title: "Snow Archive" },
                    subTitles: [{ title: "创建的歌单" }],
                    type: "nm.profilePage.playlist"
                  }
                }
              ]
            }
          ],
          modulePosition: 4,
          showType: "PLAYLIST_LIST_WITH_MORE"
        },
        {
          creatives: [
            {
              creativeId: "native-card-song",
              creativeType: "SHOWCASE_GALLERY_FIX",
              resources: [
                {
                  action: { clickAction: { targetUrl: "orpheus://song/20001" } },
                  resourceId: "20001",
                  resourceType: "song",
                  scm: "sanitized.fixture.song",
                  uiElement: {
                    images: [
                      {
                        imageUrl: "http://p1.music.126.net/sanitized-fixture/20001.jpg",
                        superscript: { text: "本周循环 12 次" }
                      }
                    ],
                    mainTitle: { title: "最近循环最多" }
                  }
                }
              ]
            },
            {
              creativeId: "native-card-playlist",
              creativeType: "SHOWCASE_GALLERY_FIX",
              resources: [
                {
                  action: { clickAction: { targetUrl: "orpheus://playlist/13001" } },
                  resourceId: "13001",
                  resourceType: "playlist",
                  scm: "sanitized.fixture.playlist",
                  uiElement: {
                    images: [
                      { imageUrl: "https://p1.music.126.net/sanitized-fixture/playlist-1.jpg" }
                    ],
                    mainTitle: { title: "我的宝藏歌单" }
                  }
                }
              ]
            },
            {
              creativeId: "native-card-duration",
              creativeType: "SHOWCASE_LIST",
              resources: [
                {
                  resourceId: "listen-duration",
                  resourceType: "listen_duration",
                  scm: "sanitized.fixture.duration",
                  uiElement: {
                    mainTitle: { title: "听歌时长" },
                    subTitles: [{ title: "累计 162 小时" }, { title: "本周 91 分钟" }],
                    superscript: { text: "音乐浓度" }
                  }
                }
              ]
            },
            {
              creativeId: "native-card-medal",
              creativeType: "SHOWCASE_VOID",
              resources: [
                {
                  resourceId: "medal-1",
                  resourceType: "medal",
                  scm: "sanitized.fixture.medal",
                  uiElement: {
                    images: [
                      { imageUrl: "https://p1.music.126.net/sanitized-fixture/medal-1.png" }
                    ],
                    mainTitle: { title: "雪夜聆听者" }
                  }
                }
              ]
            },
            {
              creativeId: "native-card-add",
              creativeType: "SHOWCASE_BUTTON",
              resources: [
                {
                  resourceId: "add",
                  resourceType: "button",
                  uiElement: { mainTitle: { title: "装扮卡片" } }
                }
              ]
            }
          ],
          channel: "PERSONAL_USER_SHOWCASE",
          code: "PERSONAL_SHOWCASE_BLOCK",
          modulePosition: 5,
          showType: "PERSONAL_SHOWCASE"
        }
      ],
      cursor: { PERSONAL_USER_SHOWCASE: "-1" },
      hasMore: false
    }
  },
  [NETEASE_SOURCE.userDetail]: {
    code: 200,
    listenSongs: 6_421,
    level: 10,
    profile: {
      artistIdentity: [{ id: 30001, name: "Aimer 乐迷" }],
      avatarDetail: {
        identityIconUrl: "https://p1.music.126.net/sanitized-fixture/avatar-frame.png"
      },
      avatarUrl: "http://p1.music.126.net/sanitized-fixture/avatar.jpg",
      eventCount: 18,
      followeds: 128,
      follows: 36,
      nickname: "Nivalis Fixture",
      playlistCount: 8,
      signature: "Music is the place where memory becomes light.",
      userId: 10001,
      vipType: 11
    }
  },
  [NETEASE_SOURCE.userLevel]: {
    code: 200,
    data: { level: 10, nextPlayCount: 20_000, nowPlayCount: 14_230, progress: 0.71 }
  },
  [NETEASE_SOURCE.vipInfo]: {
    code: 200,
    data: {
      associator: { expireTime: 1_806_220_800_000, vipCode: 100 },
      musicPackage: { expireTime: 1_806_220_800_000, vipCode: 220 },
      redVipLevel: 6
    }
  },
  [NETEASE_SOURCE.listenTotal]: {
    code: 200,
    data: { totalDuration: 582_420 }
  },
  [NETEASE_SOURCE.weeklyRecord]: {
    code: 200,
    weekData: [
      { playCount: 12, score: 100, song: track(20001, "Snow Light", 30001, "Aimer") },
      { playCount: 7, score: 74, song: track(20002, "Blue Hour", 30002, "Mizuki") },
      { playCount: 3, score: 42, song: track(20003, "Morning", 30001, "Aimer") }
    ]
  },
  [NETEASE_SOURCE.allTimeRecord]: {
    allData: [
      { playCount: 420, score: 100, song: track(20001, "Snow Light", 30001, "Aimer") },
      { playCount: 260, score: 86, song: track(20002, "Blue Hour", 30002, "Mizuki") }
    ],
    code: 200
  },
  [NETEASE_SOURCE.recentSongs]: {
    code: 200,
    data: {
      list: [
        {
          playTime: 1_777_000_000_000,
          data: track(20001, "Snow Light", 30001, "Aimer"),
          resourceId: "20001"
        },
        {
          playTime: 1_776_999_000_000,
          data: track(20002, "Blue Hour", 30002, "Mizuki"),
          resourceId: "20002"
        }
      ],
      total: 2
    }
  },
  [NETEASE_SOURCE.listenReportWeek]: {
    code: 200,
    data: {
      endTime: 1_777_172_800_000,
      listenTimeDistributionBlock: {
        durationDetails: [
          { duration: 10, period: "2026-04-20" },
          { duration: 20, period: "2026-04-21" },
          { duration: 61, period: "2026-04-22" }
        ],
        listenDays: 3,
        playDuration: 91
      },
      startTime: 1_776_568_000_000,
      type: "week"
    }
  },
  [NETEASE_SOURCE.following]: {
    code: 200,
    follow: [
      {
        avatarUrl: "https://p1.music.126.net/sanitized-fixture/following-1.jpg",
        nickname: "Snow Listener",
        signature: "fixture following",
        userId: 11001
      }
    ],
    more: false,
    size: 1
  },
  [NETEASE_SOURCE.followers]: {
    code: 200,
    followeds: [
      {
        avatarUrl: "https://p1.music.126.net/sanitized-fixture/follower-1.jpg",
        nickname: "Blue Listener",
        signature: "fixture follower",
        userId: 12001
      }
    ],
    more: false,
    size: 1
  },
  [NETEASE_SOURCE.createdPlaylists]: {
    code: 200,
    data: {
      count: 2,
      more: false,
      playlist: [
        {
          coverImgUrl: "https://p1.music.126.net/sanitized-fixture/playlist-1.jpg",
          createTime: 1_700_000_000_000,
          id: 13001,
          name: "Snow Archive",
          playCount: 820,
          privacy: 0,
          subscribed: false,
          trackCount: 48,
          userId: 10001
        },
        {
          coverImgUrl: "https://p1.music.126.net/sanitized-fixture/private-playlist.jpg",
          createTime: 1_700_000_000_100,
          id: 13002,
          name: "Private Fixture Playlist",
          playCount: 12,
          privacy: 10,
          subscribed: false,
          trackCount: 3,
          userId: 10001
        }
      ]
    }
  },
  [NETEASE_SOURCE.medals]: {
    code: 200,
    data: {
      medalNum: 1,
      obtainMedals: [
        {
          descriptionText: "连续聆听的纪念",
          medalCode: "medal-1",
          medalName: "雪夜聆听者",
          medalPicUrl: "https://p1.music.126.net/sanitized-fixture/medal-1.png",
          obtainTime: 1_700_000_000_000,
          wear: true
        }
      ]
    }
  },
  [NETEASE_SOURCE.socialStatus]: {
    code: 200,
    data: {
      iconUrl: "https://p1.music.126.net/sanitized-fixture/status-1.png",
      id: "status-1",
      name: "深夜听歌中"
    }
  }
};

export const emptyNeteaseFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.musicCardTracks]: { code: 200, songs: [] },
  [NETEASE_SOURCE.profileMusicCards]: {
    code: 200,
    data: { cardLimit: 6, cardVOList: [], open: true }
  },
  [NETEASE_SOURCE.profileShowcase]: {
    code: 200,
    data: {
      blocks: [
        {
          creatives: [
            {
              creativeId: "native-card-add",
              creativeType: "SHOWCASE_BUTTON",
              resources: [
                {
                  resourceId: "add",
                  resourceType: "button",
                  uiElement: { mainTitle: { title: "装扮卡片" } }
                }
              ]
            }
          ],
          channel: "PERSONAL_USER_SHOWCASE",
          code: "PERSONAL_SHOWCASE_BLOCK",
          showType: "PERSONAL_SHOWCASE"
        }
      ],
      cursor: { PERSONAL_USER_SHOWCASE: "-1" },
      hasMore: false
    }
  },
  [NETEASE_SOURCE.userDetail]: {
    code: 200,
    listenSongs: 0,
    profile: { nickname: "Nivalis Fixture", userId: 10001 }
  },
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

export const showcaseSchemaDriftFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.profileMusicCards]: {
    code: 200,
    data: {
      cardLimit: 6,
      cardVOList: [
        {
          canEdit: true,
          cover: "",
          extra: {},
          id: 91_999,
          jumpUrl: "",
          name: "Future Card",
          resId: "future"
        }
      ],
      open: true
    }
  },
  [NETEASE_SOURCE.profileShowcase]: {
    code: 200,
    data: {
      blocks: [
        {
          creatives: [{ creativeId: "future-card", creativeType: "SHOWCASE_FUTURE" }],
          channel: "PERSONAL_USER_SHOWCASE",
          code: "PERSONAL_SHOWCASE_BLOCK",
          showType: "PERSONAL_SHOWCASE"
        }
      ],
      cursor: { PERSONAL_USER_SHOWCASE: "-1" },
      hasMore: false
    }
  }
};

export const missingFieldFixture: SanitizedNeteaseFixture = {
  ...normalNeteaseFixture,
  [NETEASE_SOURCE.userDetail]: {
    code: 200,
    profile: { nickname: "Nivalis Fixture", userId: 10001 }
  }
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
  let playRecordRequests = 0;
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
    if (url.pathname.includes("w/v1/user/detail")) {
      return Response.json(fixture[NETEASE_SOURCE.profileHome]);
    }
    if (url.pathname.includes("personal/home/page/user")) {
      return Response.json(fixture[NETEASE_SOURCE.profileShowcase]);
    }
    if (url.pathname.includes("user/page/window/get")) {
      return Response.json(fixture[NETEASE_SOURCE.profileMusicCards]);
    }
    if (url.pathname.includes("v3/song/detail")) {
      return Response.json(fixture[NETEASE_SOURCE.musicCardTracks]);
    }
    if (url.pathname.includes("v1/user/detail")) {
      return Response.json(fixture[NETEASE_SOURCE.userDetail]);
    }
    if (url.pathname.includes("user/level")) {
      return Response.json(fixture[NETEASE_SOURCE.userLevel]);
    }
    if (url.pathname.includes("music-vip-membership")) {
      return Response.json(fixture[NETEASE_SOURCE.vipInfo]);
    }
    if (url.pathname.includes("listen/data/total")) {
      return Response.json(fixture[NETEASE_SOURCE.listenTotal]);
    }
    if (url.pathname.includes("play/record")) {
      playRecordRequests += 1;
      return Response.json(
        playRecordRequests % 2 === 0
          ? fixture[NETEASE_SOURCE.allTimeRecord]
          : fixture[NETEASE_SOURCE.weeklyRecord]
      );
    }
    if (url.pathname.includes("song/list")) {
      return Response.json(fixture[NETEASE_SOURCE.recentSongs]);
    }
    if (url.pathname.includes("realtime/report")) {
      return Response.json(fixture[NETEASE_SOURCE.listenReportWeek]);
    }
    if (url.pathname.includes("user/getfollows/")) {
      return Response.json(fixture[NETEASE_SOURCE.following]);
    }
    if (url.pathname.includes("user/getfolloweds/")) {
      return Response.json(fixture[NETEASE_SOURCE.followers]);
    }
    if (url.pathname.includes("user/playlist/create")) {
      return Response.json(fixture[NETEASE_SOURCE.createdPlaylists]);
    }
    if (url.pathname.includes("medal/user/page")) {
      return Response.json(fixture[NETEASE_SOURCE.medals]);
    }
    if (url.pathname.includes("social/user/status")) {
      return Response.json(fixture[NETEASE_SOURCE.socialStatus]);
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
