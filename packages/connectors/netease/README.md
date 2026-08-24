# NetEase Connector

Status: Phase 5 implemented under `packages/connectors/src/netease/`.

The module is intentionally read-only and limited to account validation, total listen count, weekly ranked records, recent songs, and weekly listening report. It owns NetEase hosts, `weapi`/`eapi`, MUSIC_U transport use, timeout/error mapping, payload sanitization, runtime schemas, normalization, native persistence, Widget v2 projection, and sanitized fixtures.

Interactive credential acquisition supports QR scan and SMS OTP through `NeteaseAuthClient`. It returns only semantic status or one in-memory `MUSIC_U` candidate to the Worker. Full Cookies, phone numbers, OTP values, and QR private state are not Raw Snapshot data.

It does not implement passwords, QR login, Provider writes, IP spoofing, proxy rotation, region bypass, playback unlocking, or a community API runtime service. See ADR 0012 and ADR 0013.
