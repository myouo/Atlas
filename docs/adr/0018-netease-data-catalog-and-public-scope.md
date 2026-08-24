# ADR 0018: NetEase data catalog and server-enforced public scope

- Status: Accepted
- Date: 2026-08-25

## Context

The first NetEase Widget proved the Connector and Projection pipeline but compressed several unrelated capabilities into one overview. Registry presentation toggles could choose what a Renderer drew, yet they were not an access-control boundary: a hidden field could still be present in the public Dashboard payload. The mobile Provider exposes substantially more account data—level, membership tiers, cumulative listening time, weekly/all-time rankings, social lists, created playlists, badges, and profile state—and some Raw responses also contain private metadata that must never reach a public client.

The Owner needs a complete, sanitized data entry for composition while public visitors must receive only an explicitly selected subset. Provider Raw Snapshot evidence cannot be reused as that entry because Raw is replay/debug input, not an API read model.

## Decision

1. A successful NetEase sync materializes one rebuildable, Owner-only `provider_data_catalogs` record. It contains the current normalized allowlist and a UUID data version; it never contains credentials, headers, login IPs, or unvalidated Raw fields.
2. `GET /v1/me/providers/netease/data` is authenticated and Owner-authorized. It returns the catalog with a strong `catalog:` ETag. Public endpoints never expose this resource.
3. NetEase presentation is split into semantic Widget types: identity, listening footprint, ranking, social graph, created playlists, and showcase. The legacy overview remains compatible.
4. Public disclosure is part of `dataConfig`, not `presentationConfig`. The Projector applies `publicFields`, `publicLists`, ranges, limits, and selected resource IDs before data enters `widget_projections`. Therefore omitted values are absent from the public read model rather than merely hidden by CSS.
5. Registry-driven data presets present meaningful policies such as “轻量身份”, “仅公开计数”, and “全部时间 Top 10”. Presentation controls remain display-only and continue to be excluded from Projection Keys.
6. A showcase card may select a real normalized track, created playlist, badge, or a future Provider-native music card. Nivalis-composed cards identify their source and do not claim to be the Provider’s own profile-card arrangement.
7. List endpoints are bounded. Catalog coverage records whether the fetched page is complete and the Provider-reported total where available; Nivalis never labels a partial page as complete.
8. The Provider-reported `totalDuration` is retained with seconds as its source unit. Rendering may format it as hours, while the API keeps the underlying unit and provenance explicit.

## Alternatives

- Return sanitized Raw payloads to the Owner browser: rejected because Raw schemas are unstable, excessively broad, and can contain private account metadata unrelated to composition.
- Add every value to one overview Widget: rejected because identity, ranking, social, playlist, and focal-resource cards have different configuration, layout, privacy, and refresh semantics.
- Continue using presentation toggles as privacy: rejected because hiding a field in a Renderer does not remove it from an API response.
- Fetch Provider lists on demand from the browser: rejected by ARCH-001 and because Provider I/O belongs to the Worker.
- Claim support for Provider-native music cards from the new user-detail endpoint: rejected because the observed response did not include that arrangement. The capability remains explicitly unavailable until a validated read-only source is found.

## Consequences

- Owners can inspect all normalized composition data in Settings and choose public policies per card.
- A data-policy change changes the Projection Key and requires a sync; a display-only change does not.
- Public payloads are smaller and enforce disclosure at the backend boundary.
- Catalog JSON is derived and replaceable; Raw Snapshot and immutable Dashboard Revision semantics are unchanged.
- Follow/follower and badge payloads increase Raw storage per sync. Retention remains a later explicit decision.
