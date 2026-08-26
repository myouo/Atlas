# NetEase Connector

Status: Phase 5 implemented under `packages/connectors/src/netease/`.

The module is intentionally read-only and capability-bounded. It covers account/profile data, VIP/level state, total listening duration, weekly and all-time ranks, recent songs, reports, social lists, created playlists, medals/status, and the official Exhibition Window from `user/page/window/get`. Current music-card normalization validates and preserves the ordered `cardVOList`; generic Profile V3 blocks remain supplemental data and historical-replay fallback only. The module owns NetEase hosts, `weapi`/`eapi`, MUSIC_U transport use, timeout/error mapping, payload sanitization, runtime schemas, normalization, native persistence, Widget projection, and sanitized fixtures.

Interactive credential acquisition supports QR scan and SMS OTP through `NeteaseAuthClient`. It returns only semantic status or one in-memory `MUSIC_U` candidate to the Worker. Full Cookies, phone numbers, OTP values, and QR private state are not Raw Snapshot data.

It does not implement password login, Provider writes, IP spoofing, proxy rotation, region bypass, playback unlocking, or a community API runtime service. See ADR 0012, ADR 0013, ADR 0014, and ADR 0020.
