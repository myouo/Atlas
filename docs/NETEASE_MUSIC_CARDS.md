# 网易云音乐「音乐卡片」接口接入

> 来源：网易云官方 Android APK v9.5.70，以及其官方 CDN 下发的
> `rn-exhibition-page@index` Hermes bundle/source map。
> 目标：读取用户真正配置的「音乐卡片」展柜，而不是从普通主页区块推测六张卡片。

## 2026-08-26 边界修正

官方可编排音乐卡片在代码中的业务名是 `exhibition`。权威读取链为：

```text
rn-exhibition-page@index
  → services.getExhibitionListData(userId)
  → POST /api/user/page/window/get
```

请求参数：

```json
{
  "userId": "<provider-user-id>",
  "rnVersion": 1786085676
}
```

`rnVersion` 是官方 RN 源码固定的秒级能力版本；不得改成毫秒时间戳。

`personal/home/page/user` 属于旧 Profile V3 普通主页 block read model。它仍可提供音乐品味、
代表歌曲、专辑架、歌单等补充数据，但不是用户编排的音乐卡片顺序，不能将其前六项当作展柜。

`cardVOList` 的歌曲卡片只返回 `resId`、标题和封面，生产 Raw 已确认 `extra={}`；它不包含歌手。
Connector 因此把最多六个歌曲 `resId` 批量交给只读 `/api/v3/song/detail`，并将其独立保存为
`netease.music_card_tracks` Raw Snapshot。Normalizer 只使用歌曲详情中经过 Schema 验证的
`ar[]` 作为歌手来源；若详情缺失，前端保持副标题为空，不从标题或历史记录猜测。

官方响应里的 `jumpUrl` 是 `orpheus:` 客户端深链，只作为 Raw 证据保存，不直接交给 Web
Frontend。Normalizer 使用已验证的资源类型与数字 ID 生成 `https://music.163.com` 页面：
`song`、`playlist`、`album` 分别映射到同名页面，`song_rank` 映射到
`/user/songs/rank?id=<provider-user-id>`。没有明确网页语义的类型不生成链接。

---

## 0. 关键事实速览

- 官方展柜返回 `open`、`cardLimit` 和有序 `cardVOList`。
- Atlas 真实账号验证得到 `cardLimit=6`，顺序为 `song_rank` 加五个 `song`，与官方客户端一致。
- Profile V3 blocks 与 Exhibition Window 是两个独立来源；前者不得覆盖后者。
- 原生请求参数（`z92.c.f`，已逐字节确认）：

  ```java
  HashMap map = new HashMap();
  map.put("userId", userId);            // 主页归属用户 uid
  map.put("newStyle", b11.a.u());       // "新框架全量" AB 开关 = true
  str = "personal/home/page/user";
  // 艺人主页（同构）：map.put("artistId", ...); str = "personal/home/page/artist";
  t52.e.b(str).s0(map)... → ProfileV3Entity
  ```

- 服务端还会按 `data.hasMore` / `data.cursor` 分页下发后续 blocks。

---

## 1. 接口函数

权威展柜读取：

```ts
async getProfileMusicCards(credential: string, userId: string | number) {
  return this.eapi(
    "/api/user/page/window/get",
    {
      rnVersion: 1_786_085_676,
      userId: String(userId)
    },
    credential,
    "/api/user/page/window/get",
    "android",
    MOBILE_INTERFACE_ORIGIN
  );
}
```

以下 Profile V3 接口保留为补充数据源，不承担展柜编排：

追加到 `packages/connectors/src/netease/netease-client.ts` 的 `NeteaseClient` 类中
（复用类内已有的 `eapi()` / `eapiResponse()` / `MOBILE_INTERFACE_ORIGIN` 等）。

```ts
/**
 * Profile V3 个人主页 block 数据，不代表官方 Exhibition Window 编排。
 * path: /api/personal/home/page/user → eapi/personal/home/page/user
 * 返回：{ code: 200, data: { blocks, cursor, hasMore, pageCodeContext }, xHeaderTraceId }
 *
 * @param credential MUSIC_U
 * @param userId     主页归属用户 uid
 * @param cursor     翻页游标；首页省略。服务端返回 hasMore=true 时，
 *                   需带上一页返回的 data.cursor 继续取下一页 blocks。
 */
async getProfileHomePage(
  credential: string,
  userId: string | number,
  cursor?: string | Record<string, string>
) {
  return this.eapi(
    "/api/personal/home/page/user",
    {
      newStyle: true,
      userId,
      ...(cursor ? { cursor } : {})
    },
    credential,
    "/api/personal/home/page/user", // signingPath 与 path 相同
    "android",
    MOBILE_INTERFACE_ORIGIN
  );
}

/**
 * 个人主页 tab 列表。
 * path: /api/personal/home/page/tabs → eapi/personal/home/page/tabs
 * 返回：{ code: 200, data: { tabs: [{ tabName, tabInfo:{title,subTitle} }] } }
 * 仅 whitelist { main, event, video, voice, karaoke } 生效。
 */
async getProfileHomeTabs(credential: string, userId: string | number) {
  return this.eapi("/api/personal/home/page/tabs", { userId }, credential);
}
```

> Atlas 实测说明：首请求不能人工构造空 cursor。`getProfileShowcase` 仅作为无 cursor 的首页
> 兼容别名；Connector 只在上一页明确返回 `hasMore=true` 时，把该页的完整 `data.cursor`
> 原样用于下一页请求。Android/PC 的真实 MUSIC_U A/B 均证明
> `{ PERSONAL_USER_SHOWCASE: "" }` 不能定向请求出 `PERSONAL_SHOWCASE`。
> 当前真实 Raw 中 `data.cursor` 是 JSON-serialized string；Runtime 同时兼容字符串和
> `Record<string,string>`，但 Connector 从不自行解析后重组 opaque cursor。

---

## 2. 响应数据形式

官方 Exhibition Window：

```jsonc
{
  "code": 200,
  "data": {
    "open": true,
    "cardLimit": 6,
    "cardVOList": [
      {
        "id": 123,
        "resType": "song_rank",
        "resId": "",
        "name": "听歌排行",
        "cover": "https://...",
        "jumpUrl": "orpheus://listenrank/...",
        "extra": {},
        "canEdit": false
      }
    ]
  }
}
```

官方 RN allowlist 当前包括：

```text
playlist
album
song
song_rank
latest_heart_song
latest_collect_playlist
latest_create_playlist
today_listen
latest_medal
collect_card
eggyParty
mineCraftPartner
```

下面的 `ProfileV3Entity` 结构仅用于普通主页补充数据与历史 Raw Replay：

```jsonc
{
  "code": 200,
  "data": {
    "blocks": [
      // 页面所有卡片/模块
      {
        "id": "…",
        "code": "…", // 模块编码（如 PERSONAL_SHOWCASE_BLOCK）
        "blockCode": "…", // 与 code 相同/相近
        "showType": "MUSIC_TASTE_WITH_MORE", // ★ 展示类型 → 分发到具体实体
        "modulePosition": 1, // 排序位置
        "position": "…",
        "visibleStatus": "…", // 可见性（含 FOLLOW_USER_SEE / ONLY_MYSELF_SEE 等取值）
        "uiElement": {
          // 模块标题区
          "type": "…",
          "mainTitle": { "title": "音乐卡片", "titleImgUrl": "…" },
          "subTitles": [
            { "title": "…", "titleImgUrl": "…", "action": { "clickAction": { "targetUrl": "…" } } }
          ],
          "buttons": [
            { "text": "…", "tag": "…", "action": { "clickAction": { "targetUrl": "…" } } }
          ],
          "tags": [],
          "labels": [],
          "descriptions": [],
          "icons": [],
          "images": [{ "imageUrl": "…", "height": 0, "width": 0 }],
          "videos": [],
          "textLinks": [],
          "superscript": { "text": "…", "picUrl": "…", "targetUrl": "…" },
          "colorList": ["#FFFFFF"], // ★ 卡片配色（音乐卡片强依赖）
          "redDot": false
        },
        "creatives": [
          // ★ 创意/内容条目
          {
            "creativeType": "SHOWCASE_GALLERY_FIX", // 橱窗类；其他 block 多为空
            "creativeId": "…",
            "position": "…",
            "resources": [
              {
                "resourceType": "song", // ★ 资源大类（见 §4）
                "resourceId": "22707399", // ★ 内容 id（歌曲/歌单/专辑id）
                "resourceUrl": "…",
                "resourcePolicyId": "…",
                "uiElement": {
                  // ★★ 卡片 UI
                  "type": "nm.profilePage.song", // ★★ 真正的卡片类型标识（见 §5）
                  "mainTitle": { "title": "歌名", "titleImgUrl": "…" },
                  "subTitles": [{ "title": "歌手" }],
                  "images": [{ "imageUrl": "https://p…", "height": 640, "width": 640 }],
                  "labels": [{ "text": "我喜欢的" }],
                  "colorList": ["#1a1a2e", "#16213e"], // ★ 卡片背景配色
                  "superscript": { "text": "…", "picUrl": "…" },
                  "buttons": []
                },
                "action": { "clickAction": { "targetUrl": "orpheus://song/22707399" } },
                "resourceExt": {
                  // ★ 富扩展：歌曲/专辑/歌单对象、艺人数组等
                  "artists": [{ "id": 1109057, "name": "OneRepublic" }],
                  "djRadioProgram": { "…": "…" }
                },
                "logInfo": { "alg": "…", "traceId": "…" },
                "scm": "…",
                "alg": "…"
              }
            ],
            "action": { "clickAction": { "targetUrl": "…" } }
          }
        ],
        "action": { "clickAction": { "targetUrl": "…" } },
        "crossPlatformConfig": { "…": "…" } // 非空且开关开启时走 RN/DSL 渲染
      }
    ],
    "cursor": { "…": "…" }, // ★ 分页游标（翻页时带回来）
    "hasMore": false, // ★ 是否还有下一页 blocks
    "pageCodeContext": {
      "voiceGuidePageUrl": "…",
      "voiceGuideText": "…"
    }
  },
  "xHeaderTraceId": "…" // 链路追踪（原生会回填）
}
```

**请求层说明**：`/api/` 会被改写为 `/eapi/`，params 经 eapi 加密（AES-128-ECB，
key `e82ckenh8dichen8`，message = `${path}-36cd479b6b5-${text}-36cd479b6b5-${md5("nobody"+path+"use"+text+"md5forencrypt")}`）。
类内 `encryptEapi` 已实现，无需改动。

---

## 3. Profile V3 block 的 showType → 实体（补充数据，不是展柜顺序）

来自原生 `z92/f.java` 的 `k()` 分发（按 `blocksBean.showType`）：

| showType                            | 实体（原生类名）                | 含义                                             | atlas 关注度 |
| ----------------------------------- | ------------------------------- | ------------------------------------------------ | ------------ |
| `MUSIC_TASTE_WITH_MORE`             | `ProfileMusicTasteV3Entity`     | **音乐品味**：红心数/喜欢歌手数 + 多彩 cube 卡片 | ★★★          |
| `SONG_LIST`                         | `ProfileRepMusicEntity`         | **单曲卡片列表**（最爱单曲）                     | ★★★          |
| `PERSONAL_ALBUM_RACK`               | `ProfileAlbumRackEntity`        | **专辑架**（私藏专辑）                           | ★★★          |
| `PLAYLIST_LIST_WITH_MORE`           | `ProfileCreatePlayListV3Entity` | **创建的歌单**                                   | ★★★          |
| `PERSONAL_SHOWCASE`                 | `ProfileShowCaseEntity`         | **橱窗**（横向卡片，SHOWCASE_*）                 | ★（已实现）  |
| `USER_BASIC_WITH_MORE`              | `ProfileBasicInfoV3Entity`      | 主页头部基本信息                                 | ☆            |
| `RCMD_ARTIST_WITH_MORE`             | `ProfileRcmdArtistsV3Entity`    | 推荐歌手                                         | ☆            |
| `MULTIPLE_PROFILE`                  | `ProfilePartnerEntity`          | 伴侣/情侣                                        | ☆            |
| `COMMENT_LIST_WITH_MORE`            | `ProfileCommentV3Entity`        | 评论                                             | ☆            |
| `MLOG_LIST_WITH_MORE`               | `ProfileMLogV3Entity`           | 动态                                             | ☆            |
| `VOICE_WITH_MORE`                   | `ProfileMyVoiceV3Entity`        | 我的语音                                         | ☆            |
| `VOICE_LIST_WITH_MORE`              | `ProfileVoiceListV3Entity`      | 语音列表                                         | ☆            |
| `MY_KSONG_WITH_MORE`                | `ProfileOpusInfoV3Entity`       | K歌作品                                          | ☆            |
| `TOPIC_LIST_WITH_MORE`              | `ProfileMusicColumnV3Entity`    | 话题/专栏                                        | ☆            |
| `PERSONAL_WISH_LIST`                | `ProfileWishListEntity`         | 心愿单                                           | ☆            |
| `MUSIC_BOARD_WITH_MORE`             | `BlocksBean`(原始)              | 音乐榜单                                         | ☆            |
| `LYRIC_LIST` / `TALENT_*_WITH_MORE` | `BlocksBean`(原始)              | 歌词/达人列表                                    | ☆            |

**blockCode 常量**（`z92/f$b` Metadata）：`BASIC_INFO_BLOCK`、`MUSIC_TASTE_BLOCK`、
`PERSONAL_SHOWCASE_BLOCK`、`MUSIC_COLUMN_BLOCK`、`PLAY_LIST_BLOCK`、
`COLLECT_PLAYLIST_BLOCK_CODE`、`CREATE_PLAYLIST_BLOCK_CODE`、`COMMENT_BLOCK`、`MLOG_BLOCK`、
`MY_CIRCLE_BLOCK`、`MY_VOICE_BLOCK`、`CREATE_VOICE_LIST_BLOCK`、`COLLECT_VOICE_LIST_BLOCK`、
`PERSONAL_ALBUM_RACK_BLOCK`、`PERSONAL_WISH_LIST_BLOCK`、`RCMD_ARTIST__BLOCK`、
`FOLLOW_USER_SEE`、`ONLY_MYSELF_SEE` 等。

---

## 4. 资源类型 `resourceType`（资源大类）

同一 block 的资源会有多个 `resourceType`（原生常量）：

```
albumrack_resource_type  basicInfo_identity_resource_type
basicInfo_info_resource_type        basicInfo_info_brief_resource_type
basicInfo_info_socialLink_resource_type  basicInfo_info_vip_resource_type
circle_resource_type  comment_resource_type  fangroup_resource_type
ksong_resource_type   lookAllType_resource_type  mLog_resource_type
musicColumn_normal_resource_type
musicTaste_common_color_type  musicTaste_common_resource_type
musicTaste_favoriteMusic_resource_type  musicTaste_listenRank_resource_type
myVoice_resource_type  partner_resource_type  playlist_resource_type
rcmdArtist_resource_type  song_resource_type
voicelist_resource_type  voicelist_favor_resource_type  wishlist_resource_type
```

其中与「音乐卡片」强相关的：
`musicTaste_favoriteMusic_resource_type`（红心）、`musicTaste_listenRank_resource_type`（听歌排行/时长）、
`song_resource_type`（单曲）、`playlist_resource_type`（歌单）、`albumrack_resource_type`（专辑）。

---

## 5. 真正的卡片类型标识：`uiElement.type`（`nm.profilePage.*`）

这是服务端下发的**最细粒度卡片类型**，也是原生长按卡片/渲染分发的依据
（来自 `z92/f.java` 的 `e()` 解析，按 `resource.uiElement.type` 分发）：

| `uiElement.type`                                      | 卡片                 | 原生解析目标               |
| ----------------------------------------------------- | -------------------- | -------------------------- |
| `nm.profilePage.song`                                 | 单曲卡片             | `RepMusicElementUI`        |
| `nm.profilePage.playlist`                             | 歌单卡片             | `CreatePlayListUIElement`  |
| `nm.profilePage.albumrack`                            | 专辑卡片             | `ProfileAlbumCoverElement` |
| `nm.profilePage.myFavorite`                           | 红心/我喜欢的        | `MusicTasteV3Entity.Cube`  |
| `nm.profilePage.listenRank`                           | 听歌排行/时长        | `MusicTasteV3Entity.Cube`  |
| `nm.profilePage.taste.common`                         | 音乐品味通用         | `Cube`                     |
| `nm.profilePage.commonColorCreative`                  | 彩色创意卡片         | `Cube`（带 colorList）     |
| `nm.profilePage.normal`                               | 通用卡片             | `Cube`                     |
| `nm.profilePage.wiki.identity`                        | 身份徽章             | `IdentityUIElement`        |
| `nm.profilePage.wiki.info` / `.brief` / `.socialLink` | 基本信息/简介/社交链 | `InfoUIElement` 等         |
| `nm.profilePage.circle`                               | 圈子                 | `ProfileCircleV3Entity`    |
| `nm.profilePage.comment`                              | 评论                 | `CommentElementUi`         |
| `nm.profilePage.mlog`                                 | 动态                 | `MLogElementUi`            |
| `nm.profilePage.voice`                                | 语音                 | `MyVoiceElementUi`         |
| `nm.profilePage.voicelist` / `voicelist.favorite`     | 语音列表/收藏        | `VoiceListElementUi`       |
| `nm.profilePage.partner`                              | 伴侣                 | `PartnerElementUI`         |
| `nm.profilePage.rcmdArtist`                           | 推荐歌手             | `Artist`                   |
| `nm.profilePage.wishlist`                             | 心愿单               | `WishListUIElement`        |
| `nm.profilePage.all`                                  | 全模块按钮           | `ActionUIElement`          |

> **判断卡片类型的可靠顺序**：`uiElement.type`（`nm.profilePage.*`）→ `resourceType` →
> 所在 block 的 `showType`。Atlas 将 song/playlist/albumrack 直接映射为
> `song/playlist/album`，并将聚合语义更强的 myFavorite/listenRank 保留为
> `favorite/ranking`，再回退到现有启发式。

---

## 6. Atlas 接入实现

1. Connector 读取 `/api/user/page/window/get`，以 `netease.profile_music_cards` 保存经过
   credential sanitization 的不可变 Raw Snapshot。
2. Runtime schema 严格验证 `open/cardLimit/cardVOList`。字段漂移导致同步失败并保留 LKG，
   不会把缺失字段伪造成空数据。
3. Normalizer 按 `cardVOList` 原始顺序生成 `EXHIBITION_CARD`；`song_rank` 映射为 ranking，
   `song` 映射为 song。未知 `resType` 保留为 unknown，不猜测语义。
4. Provider 模式最多展示六张官方卡片。Profile V3 只作为旧 Raw Replay 的兼容 fallback；
   新同步绝不再从多个主页 block 拼接“官方六卡”。

---

## 7. 参考：原生 Java 确认片段

`z92.c.f(long userId, int targetType)`（反编译自 `classes23.dex`）：

```java
public static final ProfileV3Entity f(long j2, int i2) {
    HashMap map = new HashMap();
    if (i2 == z92.f.d.FOR_PROFILE.getIdType()) {          // 1 = 用户主页
        map.put("userId", Long.valueOf(j2));
        map.put("newStyle", Boolean.valueOf(b11.a.u()));  // "新框架全量"= true
        str = "personal/home/page/user";
    } else if (i2 == z92.f.d.FOR_ARTIST.getIdType()) {    // 2 = 艺人主页
        map.put("artistId", Long.valueOf(j2));
        str = "personal/home/page/artist";
    }
    return (ProfileV3Entity) t52.e.b(str).s0(map).b1(/* parse */, true, ...);
}
```

`z92.f.k(profileV3Entity)`：遍历 `blocks` → 每块 `e(block)` 解析 `creatives[].resources[]`
→ 按 `showType` 分发实体 → 按 `modulePosition` 排序 → 返回页面实体列表。
