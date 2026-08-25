# ADR 0020: NetEase native personal-profile showcase

- Status: Accepted
- Date: 2026-08-25
- Supersedes: ADR 0019 decision 3 and its temporary native-endpoint limitation

## Context

The public product announcement established that “音乐卡片” is an ordered personal-home showcase,
but the legacy user-detail response did not contain its arrangement. Nivalis therefore initially
offered an honest custom gallery while leaving Provider-native cards unavailable.

Static inspection of the signed Android application identified the read-only profile request
`personal/home/page/user`. Its response contains a `PERSONAL_SHOWCASE` block and the concrete
creative variants `SHOWCASE_GALLERY_FIX`, `SHOWCASE_LIST`, `SHOWCASE_VOID`, and
`SHOWCASE_BUTTON`. The same application model parses their title, ordered images, text lines,
superscript/badge, resource identity/type, and Provider jump target. This is distinct from listening
rank data.

## Decision

1. `NeteaseConnector` requests `/api/personal/home/page/user` through the existing credential-bound
   read-only EAPI client and stores the sanitized payload as immutable
   `netease.profile_showcase` Raw evidence.
2. The runtime validator checks the response envelope. If `PERSONAL_SHOWCASE` exists, every
   creative must use a known creative type and valid resource structure; unknown variants fail as
   schema drift instead of becoming fake empty data.
3. `SHOWCASE_BUTTON` is UI affordance, not content, and is excluded. Up to six remaining creatives
   are normalized in Provider order. Titles, images, text lines, badges, target and resource
   semantics come only from the Provider response.
4. `music.netease.showcase@2` supports two explicit modes. `provider` follows the official profile
   arrangement and is the default; `custom` preserves Nivalis's owner-curated resource selection.
5. A successful endpoint response containing only the add button is a valid empty showcase. A
   missing `PERSONAL_SHOWCASE` block is `provider_omitted`. Neither state falls back to listening
   history.
6. Historical Raw Snapshot replay remains compatible. Runs created before this source existed may
   use the old, explicitly marked legacy card field when present; new syncs use the native showcase
   source as authoritative.

## Alternatives

- Keep only Nivalis custom selection: rejected once the real read-only source was identified.
- Parse card titles or screenshots from the mobile UI: rejected because the structured Provider
  response is available.
- Treat unknown creative variants as generic empty cards: rejected because that hides schema drift.
- Expose the full profile-page response publicly: rejected because only normalized allowlisted card
  semantics belong in the Owner catalog and public Projection.

## Consequences

- The Owner can choose exact Provider ordering or an independent Nivalis composition.
- One additional sequential Provider request occurs inside the asynchronous Worker sync; browser
  requests and Dashboard Revisions remain unaffected.
- Provider changes are contained in the NetEase module, and Last Known Good projections survive
  validation/fetch failures.
- The source is an undocumented external interface and must remain fixture-tested and capability
  bounded.
