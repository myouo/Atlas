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
- Completed historical periods come from `POST /api/content/activity/listen/data/report` with an
  `endTime` before the current period. A completed week returns seven ordered daily points and a
  `wallpaperBlock`.

## Decision

- Add current weekly and monthly play-rank calls to `NeteaseClient` and persist each response as an
  immutable Raw Snapshot.
- Fetch the immediately previous completed week and month as separate optional Raw Snapshots. The
  previous week is also used as the compact-view fallback when the current weekly record wall is
  unavailable.
- Normalize the record wall in the exact `picUrls` order supplied by NetEase. Match a cover to a
  `songItems` entry by its sanitized canonical artwork URL; only matched covers receive song
  metadata and a web link.
- Keep unmatched valid artwork as image-only evidence. Do not infer a song identity from array
  position because the monthly `picUrls` order is not guaranteed to equal `songItems` order.
- Extend the calendar projection with optional semantic `recordWall` and `previousWeek` fields.
  Dashboard Revision, layout, and `rev:` ETag remain unchanged by sync.
- The compact renderer places the selected calendar beside its Provider record wall. If the current
  weekly wall is unavailable and a previous completed week exists, it renders previous week on the
  left and current week on the right.
- Compact record walls are bounded at 20 covers and use three explicit container layouts: `3×4`
  (12 covers) for narrow modules, `5×4` for normal modules, and `10×2` for wide modules. Covers stay
  within 32–34 px; remaining horizontal and vertical space is distributed between tracks instead of
  scaling artwork without bounds. The expanded wall is also bounded by the Contract at 20 items.
- The expanded ModuleShell renders current then previous week, followed by current then previous
  month. Periods and their daily records are newest-first. Complete current record walls follow the
  calendar history so they cannot obscure it. The source arrays remain Provider-ordered in
  normalized data; reversal is a presentation choice only.

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

- A normal sync adds two bounded read-only rank requests and, when possible, one previous-week plus
  one previous-month report request.
- Schema drift in the rank payload fails before projection replacement, preserving Last Known Good.
- Older Raw Snapshot replay remains valid because the new rank and previous-week sources are
  optional; their projection fields become explicitly unavailable.
- Record-wall artwork remains Provider-hosted. Nivalis does not copy it into Object Storage.
