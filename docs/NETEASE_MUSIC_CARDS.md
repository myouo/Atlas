# 网易云音乐「音乐卡片」接口接入

> 来源：`NeteaseCloudMusic_Music_official_9.5.70.260812161853_3264.apk`（v9.5.70）jadx 逆向。
> 目标：为 `@nivalis/connectors` 的 `netease-provider` 补齐「我的音乐卡片」的全量获取与解析能力。
> 已确认的调用链（原生）：`ProfileHomePageFragmentV3.loadInBackground()`
> → `z92.f.h(userId, FOR_PROFILE)` → `z92.c.f(userId, 1)`
> → `eapi/personal/home/page/user`，参数 `{ userId, newStyle }`。

---

## 0. 关键事实速览

- 「音乐卡片」文案在 APK 内不存在，由服务端在 block 的 `uiElement.mainTitle.title` 下发；
  原生对应的是**个人主页 V3（profile3）的 blocks 体系**。
- 主页数据只有一个真实来源：**`/api/personal/home/page/user`**（eapi 加密）。
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

## 1. 接口函数（追加进 `NeteaseClient`）

追加到 `packages/connectors/src/netease/netease-client.ts` 的 `NeteaseClient` 类中
（复用类内已有的 `eapi()` / `eapiResponse()` / `MOBILE_INTERFACE_ORIGIN` 等）。

```ts
/**
 * 个人主页全量数据 —— 包含所有「音乐卡片」block。
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

## 2. 响应数据形式（ProfileV3Entity）

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

## 3. block 的 showType → 卡片实体（完整映射）

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

`netease-normalizer.ts` 使用通用收集器遍历每个已验证页面的 `data.blocks`，把下列
block 资源归一化为卡片：

1. **多 block 收集**：
   - `MUSIC_TASTE_WITH_MORE`（含 `nm.profilePage.myFavorite` / `listenRank` cube）
   - `SONG_LIST`、`PERSONAL_ALBUM_RACK`、`PLAYLIST_LIST_WITH_MORE`
   - `PERSONAL_SHOWCASE`（现有逻辑保留）
2. **类型优先级**：按 `uiElement.type` 优先判定 `cardKind`（见 §5 表），并保留
   `providerUiType`、block 来源及 Provider 可见性。
3. **有界分页**：`data.hasMore === true` 时用该响应的完整 `data.cursor` 调
   `getProfileHomePage`；每页成为独立 Raw Snapshot，重复 cursor 或超过页上限会让同步失败。
4. **Catalog / Projection 分工**：Owner Catalog 保存全部规范化卡片；公开 Provider 模式过滤
   `ONLY_MYSELF_SEE` / `FOLLOW_USER_SEE` 并最多展示 6 张。显式 custom 模式承担 Owner 主动披露。

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
