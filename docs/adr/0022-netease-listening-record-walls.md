# ADR 0022 — NetEase listening record walls and calendar detail

## Context

The `music.netease.calendar` projection originally exposed only Provider-reported daily listening
minutes. A compact weekly chart leaves useful space unused, while the official NetEase listening
footprint presents a record wall beside the calendar and lets the owner open the ordered daily
detail.

Evidence was collected without persisting credentials or personal payloads:

- `POST /api/content/activity/listen/data/realtime/report` with `type=week` returns
  `weekTodayListenBlock.coverUrls`, but the block describes today's listening rather than the whole
  week.
- The official `https://sg.music.163.com/st/listen-home` application calls
  `POST /api/content/activity/listen/data/song/play/rank` for both `week` and `month`.
- That endpoint returns `songItems` plus an ordered `picUrls` array. The official record-wall
  renderer consumes `picUrls` directly and identifies its ordering as Provider-owned.
- A real current-month response contained 20 `picUrls` but only 19 covers that matched a
  `songItems` identity. The unmatched cover also failed to match the current weekly Top 100,
  all-time Top 100, or recent 300 listens; requesting larger limits or offsets still returned the
  same 20 rank rows.
- Completed historical periods come from `POST /api/content/activity/listen/data/report` with an
  `endTime` before the current period. A completed week returns seven ordered daily points and a
  `wallpaperBlock`.

## Decision

- Add current weekly and monthly play-rank calls to `NeteaseClient` and persist each response as an
  immutable Raw Snapshot.
- Fetch a hard-bounded three-period history window for both completed weeks and completed months as
  separate optional Raw Snapshots. Each next request is anchored to the selected response's
  `startTime - 1`; week and month advance independently. The first previous week remains available
  through the compatibility field used by the compact fallback.
- Normalize the record wall in the exact `picUrls` order supplied by NetEase. Match a cover to a
  `songItems` entry by its sanitized canonical artwork URL; only matched covers receive song
  metadata and a web link.
- Keep unmatched valid artwork as image-only evidence. Do not infer a song identity from array
  position because the monthly `picUrls` order is not guaranteed to equal `songItems` order. Its UI
  label is the semantic `仅封面`; it is never called a song and is not made clickable.
- Extend the calendar projection with optional semantic `recordWall`, compatibility
  `previousWeek`/`previousMonth`, and bounded `weekHistory`/`monthHistory` fields. Every historical
  range keeps its own Provider `wallpaperBlock`. Dashboard Revision, layout, and `rev:` ETag remain
  unchanged by sync.
- The compact renderer places the selected calendar beside its Provider record wall. If the current
  weekly wall is unavailable and a previous completed week exists, it renders previous week on the
  left and current week on the right.
- Compact record walls are bounded at 20 covers and use three explicit container layouts: `3×4`
  (12 covers) for narrow modules, `5×4` for normal modules, and `10×2` for wide modules. Covers stay
  within 32–34 px; remaining horizontal and vertical space is distributed between tracks instead of
  scaling artwork without bounds. The expanded wall is also bounded by the Contract at 20 items.
- The expanded ModuleShell renders only the active anchored period through one week/month switcher
  and bounded previous/newer arrows. Week and month retain separate date anchors, so switching views
  restores that view's selected period and a refreshed Projection cannot silently shift an index to
  a different month. The active period label stays above the visualization; month data uses a
  circular date-only heatmap and exact minutes stay in accessible labels/tooltips. Calendar and wall
  stretch to one desktop row height, while narrow viewports keep the stacked layout. Source arrays
  and record-wall entries remain Provider-ordered in normalized data.
- `ModuleShell` owns a small in-memory transient-state bridge for its compact and Portal-mounted
  instances. The selected range and date anchors therefore survive opening/closing the overlay
  without entering Widget config, Dashboard Revision, LocalStorage, or the API Contract.
- Compact calendar and ranking controls share a two-option sliding indicator. Content transitions
  are bounded to 260 ms and reduced-motion preferences disable them through the global motion rule.

## Alternatives

- Use `weekTodayListenBlock.coverUrls` as a weekly wall: rejected because its official semantics are
  today's listened songs.
- Derive a monthly wall from recent-listen history: rejected because the recent endpoint is capped
  and cannot reproduce the official month ranking.
- Pair `picUrls` and `songItems` by array index: rejected because a real monthly response disproved
  that assumption.
- Fill missing week dates with zero: rejected because an omitted or future day is not evidence of
  zero listening.

## Consequences

- A normal sync adds two bounded read-only rank requests and, when possible, up to three chained
  previous-week plus three chained previous-month report requests. The hard cap prevents unbounded
  Provider work; the UI mounts only the selected anchor, avoiding off-screen wall DOM and image
  decoding.
- Schema drift in the rank payload fails before projection replacement, preserving Last Known Good.
- Older Raw Snapshot replay remains valid because the new rank and previous-week sources are
  optional; their projection fields become explicitly unavailable.
- Record-wall artwork remains Provider-hosted. Nivalis does not copy it into Object Storage.
