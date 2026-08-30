# NetEase Connector

Status: Phase 5 implemented under `packages/connectors/src/netease/`.

The module is intentionally read-only and capability-bounded. It covers account/profile data, VIP/level state, total listening duration, weekly and all-time ranks, recent songs, weekly/monthly listening reports, official week/month play-rank record walls, social lists, created playlists, medals/status, and the official Exhibition Window from `user/page/window/get`. Current music-card normalization validates and preserves the ordered `cardVOList`; generic Profile V3 blocks remain supplemental data and historical-replay fallback only. The module owns NetEase hosts, `weapi`/`eapi`, MUSIC_U transport use, timeout/error mapping, payload sanitization, runtime schemas, normalization, native persistence, Widget projection, and sanitized fixtures.

Public projections attach official `https://music.163.com` Web URLs only when a stable public
Provider ID and an exact route exist: user profiles, listening ranks, tracks, artists, playlists,
albums, and Exhibition resources. Raw `orpheus:` deep links remain evidence but are never exposed as
Web navigation. Statistics, trends, VIP state, and medals stay non-clickable unless NetEase provides
an equally precise Web resource.

Created-playlist responses retain their Provider `count` before privacy filtering. Playlist rows
whose official numeric `privacy` value is `10` are excluded before Native/Projection/catalog output,
while `providerTotal` and pagination completeness continue to describe the original Provider total.
Sanitized Raw Snapshots remain immutable evidence of the unfiltered response.

The `music.netease.social` projection remains readable for historical Revision compatibility, but
the default Dashboard no longer exposes separate following/follower cards because they duplicate
the identity surface. Owner-only catalog data and official `/user/follows` or `/user/fans` routes
remain available for future compositions.

Compact rendering limits are presentation concerns, not Projection truncation. When the Owner
selects the complete-public presets, ranking v2 preserves both Provider Top 100 lists and created
playlists preserve the normalized collection (bounded by the Connector's 500-item safety limit).
The compact card renders a dense preview; the expanded reading panel consumes every projected row.

Interactive credential acquisition supports QR scan and SMS OTP through `NeteaseAuthClient`. It returns only semantic status or one in-memory `MUSIC_U` candidate to the Worker. Full Cookies, phone numbers, OTP values, and QR private state are not Raw Snapshot data.

It does not implement password login, Provider writes, IP spoofing, proxy rotation, region bypass, playback unlocking, or a community API runtime service. See ADR 0012, ADR 0013, ADR 0014, and ADR 0020.

The focused `pnpm test:netease:cards` probe reads an ignored root `.env.local`, invokes only the
production account, Exhibition Window, and song-detail client paths, validates each response, and
prints a sanitized title/artist summary. `--fixture` runs the same path without credentials or any
database/runtime service. This is the required pre-deployment check for music-card changes.

Listening reports use the same read-only realtime-report route with explicit `type: week` and
`type: month` requests. A real sanitized probe confirmed the monthly response exposes Provider
dates and minute-valued `listenTimeDistributionBlock.durationDetails`; the independent
`music.netease.calendar@1` Projection preserves those daily values for the week/month heatmap.

The calendar also consumes the official read-only
`content/activity/listen/data/song/play/rank` endpoint for current week/month record walls. Its
`picUrls` order is preserved exactly; song metadata and Web links are attached only after matching a
sanitized artwork URL to `songItems`. The historical report endpoint builds independent three-period
week and month windows by anchoring every next request to the selected response's `startTime - 1`.
Each historical report keeps its own `wallpaperBlock`; the expanded UI mounts only the active anchor
and restores separate week/month anchors when the view switches. The first previous week also acts
as a semantic fallback when a current weekly wall is unavailable. See ADR 0022.

Provider wall completeness and song identity are separate. A real monthly response returned one
valid ordered cover without a matching rank item, and no match existed in the other bounded listen
sources. Nivalis therefore preserves it as non-clickable `仅封面` evidence instead of inventing a
song name or silently dropping the Provider wall entry.
