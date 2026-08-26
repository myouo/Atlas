# ADR 0021: NetEase exhibition-window source

- Status: Accepted
- Date: 2026-08-26
- Supersedes: ADR 0020 decisions 2, 3, 5, and 6 for current syncs

## Context

ADR 0020 treated resources collected from `personal/home/page/user` as the Provider-native music-card
arrangement. Production Raw evidence disproved that assumption: the endpoint returned music-taste and
playlist blocks but no five songs selected by the Owner, and `PERSONAL_SHOWCASE_BLOCK` was false.

The official Android release list exposes `rn-exhibition-page@index`. Its official CDN source map
contains the application source for `services.getExhibitionListData`, which calls
`POST /api/user/page/window/get` with `userId` and the seconds-based `rnVersion=1786085676`.
The response owns `open`, `cardLimit`, and the ordered `cardVOList`.

A credential-bound production probe returned exactly six cards in Owner order: one `song_rank`
followed by five `song` resources. This matched the Owner's official client and disproved selection
from generic Profile V3 blocks.

## Decision

1. `netease.profile_music_cards` is the authoritative Raw source for current Provider-native cards.
2. The Connector sends only the official read parameters and remains read-only.
3. The Normalizer validates the full Exhibition envelope and preserves `cardVOList` order.
4. Provider mode reads only Exhibition cards. It never selects the first six resources from music
   taste, playlists, album rack, or `PERSONAL_SHOWCASE`.
5. Profile V3 Raw remains available for other profile semantics and for historical replay. Runs that
   predate `netease.profile_music_cards` may use the previous Profile V3/legacy fallback, but new runs
   treat Exhibition as authoritative.
6. Unknown card resource types remain explicit `unknown` values. No field, ordering, or semantic label
   is fabricated.
7. Exhibition song cards contain no artist metadata (`extra` is empty in production evidence).
   The Connector batches their `resId` values through the read-only `/api/v3/song/detail` capability,
   stores the response as separate Raw evidence, and the Normalizer derives artist subtitles only from
   the validated `ar[]` field.

## Consequences

- The official card arrangement now matches the Provider's user-configured six-card window.
- NetEase-specific endpoint/version knowledge remains inside the Connector module.
- Schema drift fails before Projection commit, so Last Known Good remains visible.
- The undocumented endpoint and RN capability version require monitoring, but changes do not affect
  Dashboard Revisions, the sync runtime, or Widget renderers.
