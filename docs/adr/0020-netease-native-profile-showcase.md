# ADR 0020: NetEase native personal-profile showcase

- Status: Accepted
- Date: 2026-08-25
- Supersedes: ADR 0019 decision 3 and its temporary native-endpoint limitation

## Context

The public product announcement established that “音乐卡片” is an ordered personal-home showcase,
but the legacy user-detail response did not contain its arrangement. Nivalis therefore initially
offered an honest custom gallery while leaving Provider-native cards unavailable.

Static inspection of the signed Android application identified the read-only profile request
`personal/home/page/user`. Its response contains the personal-showcase block identified by
`showType === "PERSONAL_SHOWCASE"` / `code === "PERSONAL_SHOWCASE_BLOCK"`, with concrete creative
variants `SHOWCASE_GALLERY_FIX`, `SHOWCASE_LIST`, `SHOWCASE_VOID`, and `SHOWCASE_BUTTON`. The same
application model parses their title, ordered images, text lines, superscript/badge, resource
identity/type, and Provider jump target. This is distinct from listening rank data and from the
separate `PERSONAL_ALBUM_RACK` album-rack entity.

## Decision

1. `NeteaseConnector` requests `/api/personal/home/page/user` through the existing credential-bound
   read-only EAPI client and stores every sanitized response page as immutable
   `netease.profile_showcase[.page.N]` Raw evidence. The first request sends only `userId` and
   `newStyle=true`. A cursor is sent only when the preceding response says `hasMore=true`, and it is
   copied exactly from that response. The Provider currently returns a JSON-serialized cursor
   string, while the validator also tolerates a direct string map for compatibility. Repeated
   cursors and the page bound fail the run instead of committing partial data.
2. The runtime validator checks every page envelope. The Normalizer collects card resources from
   `MUSIC_TASTE_WITH_MORE`, `SONG_LIST`, `PERSONAL_ALBUM_RACK`,
   `PLAYLIST_LIST_WITH_MORE`, and `PERSONAL_SHOWCASE`; Album Rack remains distinct from Showcase.
3. `uiElement.type` is the primary semantic discriminator, followed by `resourceType` and then
   `showType`. Titles, ordered images, labels, text lines, badges, Provider visibility, targets, and
   resource identity come only from Provider responses. Unknown Showcase creative variants remain
   schema drift, while unknown non-Showcase UI types are retained as `unknown` cards.
4. `SHOWCASE_BUTTON` and `nm.profilePage.all` are UI affordances, not content, and are excluded. The
   Owner Catalog retains all normalized cards; the public Projection remains bounded to six.
5. Cards marked `ONLY_MYSELF_SEE` or `FOLLOW_USER_SEE` remain available to the authenticated Owner
   Catalog but are excluded from automatic Provider-mode publication. Explicit custom selection is
   the Owner-controlled disclosure path.
6. `music.netease.showcase@2` supports two explicit modes. `provider` follows the eligible Provider
   order and is the default; `custom` preserves Nivalis's owner-curated resource selection. Neither
   mode falls back to listening history.
7. Historical Raw Snapshot replay remains compatible. Runs created before this source existed may
   use the old, explicitly marked legacy card field when present; new syncs use the profile-page
   read model as authoritative.

## Alternatives

- Keep only Nivalis custom selection: rejected once the real read-only source was identified.
- Parse card titles or screenshots from the mobile UI: rejected because the structured Provider
  response is available.
- Treat unknown creative variants as generic empty cards: rejected because that hides schema drift.
- Expose the full profile-page response publicly: rejected because only normalized allowlisted card
  semantics belong in the Owner catalog and public Projection.

## Consequences

- The Owner can choose exact Provider ordering or an independent Nivalis composition.
- One or more bounded sequential Provider requests occur inside the asynchronous Worker sync;
  browser requests and Dashboard Revisions remain unaffected.
- Provider changes are contained in the NetEase module, and Last Known Good projections survive
  validation/fetch failures.
- The source is an undocumented external interface and must remain fixture-tested and capability
  bounded.
- The profile-page response shape remains an undocumented external interface and may need an
  isolated update when the Provider changes its block naming or client routing.
