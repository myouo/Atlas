# Delivery TODO

## Phase 6+

- Add GitHub, Bangumi, Steam, and Bilibili through the established Connector/Normalizer/Native/Projector pattern, one Provider at a time.
- Add Provider-specific native tables only when real semantics are known; never introduce a universal activity table.
- Decide Provider/Raw/Native retention and explicit user data-erasure policies from measured storage growth.
- Add credential-key rotation tooling; Phase 5 stores a version and key ID but does not run automatic re-encryption.
- Add session cleanup/rate limiting and production observability without logging Provider payloads or secrets.
- Complete appearance persistence, backups, and deployment adapters.
- Identify and validate the Provider-native personal-home “音乐卡片” endpoint before enabling `provider_music_card`; until then Nivalis showcase cards declare their normalized track/playlist/medal source.
- Add a measured Revision retention/archive policy only if immutable history growth requires it.

Phase 5 NetEase remains read-only and capability-bounded. QR and SMS OTP are implemented through encrypted Worker-owned attempts; password login, Provider writes, proxy/IP bypass, automatic schema repair, and additional Providers are not hidden behind temporary code. Revision conflict handling continues to detect/preserve/inform, and Provider synchronization remains independent from Revision concurrency.
