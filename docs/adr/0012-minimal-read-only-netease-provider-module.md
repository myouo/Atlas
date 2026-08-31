# ADR 0012: Implement a minimal direct, read-only Netease Provider module

- Status: Accepted
- Date: 2026-08-24

## Context

NetEase Cloud Music exposes no stable public API for the desired personal listening data. Community implementations show frequently changing `weapi`/`eapi` behavior, Cookie authentication, and several unrelated write/bypass features. Nivalis needs a very small read-only surface without making a community API server a runtime dependency.

## Decision

All Netease-specific code lives under `packages/connectors/src/netease/`:

```text
NeteaseProviderRuntime
├── NeteaseClient        endpoint allowlist, weapi/eapi, Cookie, timeout
├── NeteaseConnector     bounded read scheduler
├── NeteaseNormalizer    TypeBox runtime validation and semantic mapping
├── NeteaseNativeStore   provider-specific Kysely persistence
└── NeteaseProjector     music.netease.overview@2
```

The first allowlisted read capabilities are:

- account/login-status validation;
- provider-reported total listen count from user detail;
- weekly ranked listening records with track metadata and play counts;
- recent song records with Provider timestamps when present;
- weekly listening report when the Provider returns a recognized report shape.

The module implements only the protocol necessary for those endpoints using Node's built-in cryptography. It does not import or run the community server/package.

- Requests use an explicit abort timeout. The generic runtime defaults to sequential transport;
  infrastructure may opt into the Connector-owned bounded scheduler up to a hard maximum of three
  independent reads. Cursor pagination, report-history chains, and dependent card-detail requests
  remain sequential within their task.
- No proxy, random IP, `X-Real-IP`, region bypass, unlock, playback URL, scrobble, login-by-password, follow, like, comment, or other write operation exists.
- `MUSIC_U` is resolved inside `NeteaseConnector`; SyncWorkerService never receives the plaintext.
- Each response is recursively sanitized into a payload-only Raw Snapshot with an explicit source kind. Credential-bearing keys are removed; request objects, request headers, response headers, Cookie, CSRF, and encryption inputs are never returned for persistence.
- HTTP timeout/reset/429/5xx maps to `RetryableProviderError`. Authentication responses map to non-retryable `ProviderCredentialError`. Recognized permanent request failures and runtime schema mismatch do not retry.
- Runtime schema failure never substitutes `0`, `null`, or an empty array. The Raw batch is already persisted before normalization; the SyncRun fails and Last Known Good native/projection data remains.
- Real Provider integration is opt-in through `NETEASE_INTEGRATION_TEST=1` and secrets. Normal CI uses a manually reviewed sanitized corpus covering normal, empty, partial, expired, drift, missing, unknown, and large payloads.

## Response semantics

- Provider-reported counts remain labeled `provider_reported`.
- Aggregations over weekly ranked records are labeled `nivalis_derived` with explicit `top_records` coverage.
- Recent records become listen events only when the Provider supplies a valid `playTime`; Nivalis never invents a timestamp.
- Genre is unavailable unless a real Provider source supplies it. Nivalis does not infer genre from artists, titles, or album names.
- Artwork URLs may be retained as Provider data, but Phase 5 neither downloads nor proxies them.

## Schema drift update (2026-08-25)

Sanitized production snapshots showed three read-only response changes without exposing account values:

- cumulative `listenSongs` is returned at the top level of `/weapi/v1/user/detail/{uid}`, not by the user-level response;
- recent-song entries carry the track under `data` (the validator retains legacy `resource` compatibility);
- the weekly report exposes minute-valued `listenTimeDistributionBlock.playDuration` and dated `durationDetails` instead of the legacy second-valued `duration`/`points` pair.

The same endpoint was later validated with `type: month`: it returns `type: "month"`, Provider
`startTime`/`endTime`, month-to-date `durationDetails`, `listenDays`, and minute-valued
`playDuration`. Nivalis fetches week and month as separate immutable Raw Snapshots and rejects a
response whose declared period does not match the requested source kind.

The Connector fetches account identity before scheduling the remaining read capabilities. The Normalizer validates and maps both recognized report/recent shapes explicitly. Unknown shapes still fail with `ProviderSchemaMismatchError`; only explicitly optional Provider omissions become semantic `unavailable` values.

## Cloudflare latency update (2026-08-31)

Cloudflare production evidence showed successful NetEase SyncRuns spending about 21 seconds in the
consumer even without retries. The Connector still resolves account identity first, then schedules
only independent read groups with a configurable concurrency capped at three. The Cloudflare adapter
uses three; PostgreSQL and direct callers retain the sequential default unless explicitly configured.
Weekly/monthly history traversal, Provider pagination, and exhibition-card detail dependencies never
fan out. A real credential-safe local timing of the same 28 requests fell from 6.68–7.92 seconds to
2.55 seconds without changing endpoints, schemas, sanitization, or projection semantics.

Completed listening-history windows are immutable for the duration of the same current Provider
week/month. Infrastructure may offer the Connector the previous successful window, but the
Connector reuses it only when all three entries exist, source-kind indexes are contiguous, the
declared period matches, daily data exists, and every `startTime`/`endTime` boundary forms the exact
Provider chain behind the new current report. A missing or shifted entry invalidates only that
week/month range and performs the normal Provider reads. Reused payloads remain part of the new
sanitized Raw batch, so replay completeness does not depend on an older SyncRun.

## Alternatives

- Run NeteaseCloudMusicApi Enhanced as another service: rejected because it adds a broad privileged runtime and many features Nivalis forbids.
- Depend directly on its npm package: rejected because its full transport, proxy, write, and release surface would become a production dependency.
- Implement the whole API: rejected because Phase 5 only validates the Connector pattern.
- Use browser calls: rejected by ARCH-001/002 and because it would expose credentials.

## Consequences

- Provider changes should be isolated to schemas/client/normalizer inside this module.
- Private API behavior and account risk remain real operational risks; the Provider can degrade without making Nivalis unavailable.
- The protocol constants and official Netease hostnames are intentionally Provider Adapter details, not deployment instance configuration.

## Behavior references

- [NeteaseCloudMusicApi Enhanced source](https://github.com/neteasecloudmusicapienhanced/api-enhanced)
- [Current `user_record` adapter](https://raw.githubusercontent.com/neteasecloudmusicapienhanced/api-enhanced/main/module/user_record.js)
- [Current `record_recent_song` adapter](https://raw.githubusercontent.com/neteasecloudmusicapienhanced/api-enhanced/main/module/record_recent_song.js)
- [Independent Rust implementation](https://github.com/SPlayer-Dev/ncm-api-rs)
