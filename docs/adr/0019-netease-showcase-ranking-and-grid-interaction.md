# ADR 0019: NetEase showcase, dual ranking, and collision-free grid interaction

- Status: Accepted
- Date: 2026-08-25
- Native-endpoint limitation superseded by ADR 0020

## Context

The first `music.netease.showcase@1` treated a single weekly/all-time ranked track as a
“music card”. That is not the Provider feature's semantics. NetEase describes personal-home music
cards as an owner-curated, reorderable collection of tracks, playlists, albums, listening data,
badges, and related highlights. The product currently allows at most six cards. The first ranking
Widget also required choosing either weekly or all-time data, making comparison awkward.

The Dashboard used free positioning with collision movement enabled. During drag or resize,
`react-grid-layout` continuously moved neighboring cards, so a deliberate arrangement felt as if
cards repelled one another.

## Decision

1. `music.netease.showcase@2` is a manually ordered gallery of zero to six explicit resource
   selections. It never falls back to a historical rank when the selection is empty or invalid.
2. The Owner-only Provider catalog supplies eligible sanitized tracks, created playlists, medals,
   Provider-reported listening duration, and future validated Provider-native music cards. The
   Projector enforces selection order, uniqueness, and the six-item bound before public persistence.
3. Nivalis labels this composed feature “音乐展柜”. It does not claim to reproduce the Provider's
   own card arrangement until a read-only native arrangement endpoint has been validated.
4. `music.netease.ranking@2` carries independently scoped weekly and all-time ranges in one
   projection. The Renderer switches locally between them and offers editorial or compact
   presentation without another API request.
5. Existing current v1 ranking/showcase instances receive immutable `schema_upgrade` successors.
   Historical Revisions remain v1. Ranking becomes a dual range; an implicit v1 showcase becomes
   an empty gallery instead of silently selecting a ranked track.
6. Edit mode allows temporary overlap during pointer interaction. Neighboring cards remain still.
   At interaction end, the layout engine swaps the primary collision into the moved card's origin
   where possible and settles other collisions into the nearest free cells. The persisted layout
   remains non-overlapping and manually positioned.

## Alternatives

- Keep a single ranked song and rename it: rejected because it still misstates the Provider
  concept and silently chooses content for the Owner.
- Render separate weekly and all-time cards: retained only as readable v1 history; rejected as the
  preferred form because it duplicates layout chrome and makes comparison harder.
- Let grid items overlap permanently: rejected because card content would become inaccessible.
- Use live vertical compaction during drag: rejected because it causes the reported repulsion and
  destroys manual placement intent.

## Consequences

- New and migrated dashboards use schema v2 while all immutable history stays readable.
- A migrated implicit showcase is intentionally empty until the Owner selects public items and
  synchronizes the corresponding projection.
- Provider-native arrangement discovery remains a Connector TODO, not a fabricated capability.
- Drag and resize feel direct; a small deterministic settle animation occurs only after release.

## Source note

NetEase's official May 2025 announcement describes the feature as personal-home cards containing
chosen tracks, playlists, albums, listening data, badges, custom titles, and user-controlled
ordering: <https://www.sina.cn/news/detail/5167973611342937.html>.
