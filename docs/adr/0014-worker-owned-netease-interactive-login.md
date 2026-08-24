# ADR 0014: Model NetEase QR and SMS login as Worker-owned ephemeral attempts

- Status: Accepted
- Date: 2026-08-24

## Context

Phase 5 initially accepts an existing `MUSIC_U` value through a write-only Owner endpoint. Owners also need a safer acquisition path that does not require browser developer tools. QR and SMS login call unstable Provider endpoints, return full Cookie headers, and may remain active for several minutes. They therefore cannot run in the browser, Fastify route, Dashboard service, SyncRun, or Raw Snapshot pipeline.

Phone numbers, SMS codes, QR keys, and intermediate Provider cookies are authentication material. They must survive API/Worker restarts long enough to complete a flow without becoming durable account data or appearing in logs, queue payloads, API responses, or Raw Snapshots.

## Decision

Introduce a provider-neutral `ProviderAuthAttempt` resource with one public UUID and two supported methods:

```text
Owner Web
  ↓ generated API client
ProviderAuthService
  ↓ ProviderAuthJobQueue port
pg-boss (attempt UUID only)
  ↓ separate Worker
ProviderAuthWorkerService
  ↓ ProviderAuthRuntimeRegistry
NeteaseAuthClient
  ↓
MUSIC_U extracted in memory
  ↓ existing ProviderConnectionService
AES-GCM ProviderCredentialStore + validation SyncRun
```

Public statuses are `queued`, `preparing`, `waiting_for_scan`, `waiting_for_confirmation`, `waiting_for_code`, `verifying`, `connected`, `expired`, and `failed`. The browser polls only Nivalis. The pg-boss identifier and internal operation are never exposed.

`provider_auth_attempts` stores safe metadata and an optional encrypted opaque state envelope. `SecretProtector` uses the new `provider_auth_attempt` purpose and binds the envelope to Owner and attempt UUID. QR state, phone number, country code, and submitted SMS code are encrypted. Terminal transitions erase the envelope. Only a masked phone number and QR URL are public.

- Starting a second login while one remains active returns the existing attempt, preventing login storms and stale flows from racing to replace a newer credential.
- Disconnect invalidates every active attempt and erases its envelope. Credential completion also compares the attempt creation time with the connection's last disabled timestamp under a row lock, so an in-flight old attempt cannot resurrect a disconnected connection.
- QR preparation generates a key and URL in the Worker. Short delayed jobs poll Provider status. Community status 801 maps to waiting, 802 to confirmation, 803 to success, and 800 to expiration.
- SMS creation sends one code in the Worker and enters `waiting_for_code`. Owner verification encrypts the code, queues one verification job, and enters `verifying`.
- A successful Provider response is parsed in Connector memory. The full `Set-Cookie` collection is discarded after extracting `MUSIC_U`; it is never persisted or returned.
- Provider authentication is not a Raw Snapshot source and creates no Dashboard Revision.
- Every new fixture QR key owns a fresh poll lifecycle; test transport counters are never shared across generated QR sessions.
- Transient network errors use bounded queue retry. Invalid codes, risk-control responses, expiration, and missing `MUSIC_U` fail without a retry storm.
- Password login is not implemented. Plaintext or MD5-equivalent passwords never enter Nivalis.

## HTTP contract

```text
POST /v1/me/providers/netease/auth-attempts/qr
POST /v1/me/providers/netease/auth-attempts/sms
GET  /v1/me/providers/netease/auth-attempts/{attemptId}
POST /v1/me/providers/netease/auth-attempts/{attemptId}/verify
```

All endpoints require Owner authorization. Unsafe operations retain the existing Origin/CSRF boundary. SMS inputs are write-only. Responses contain attempt/status metadata only.

## Alternatives

- Browser calls NetEase directly: rejected because it exposes protocol and credentials and violates ARCH-001.
- Fastify performs interactive Provider I/O: rejected because Provider execution belongs in the Worker and would couple API latency to NetEase.
- Store full Cookies or phone/code in SyncRun payloads: rejected because queue rows and operational tooling are not a secret store.
- Store login responses as Raw Snapshots: rejected because authentication material is not replayable Provider data.
- Password login: rejected because a password or its replayable MD5 representation would become a higher-risk credential than the session token Nivalis actually needs.

## Consequences

- API and Worker share one encrypted, restart-safe attempt state through PostgreSQL.
- QR polling creates small delayed pg-boss jobs rather than holding one Worker callback open.
- The Provider's non-public login protocol may drift independently from read endpoints; changes remain inside `packages/connectors/src/netease/`.
- SMS delivery can be rate-limited or blocked by Provider risk controls. Manual `MUSIC_U` remains the recovery path.

## Behavior references

- [NetEase QR modules](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/login_qr_check.js)
- [NetEase phone login module](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/login_cellphone.js)
- [Independent login API documentation](https://github.com/SPlayer-Dev/ncm-api-rs/blob/main/docs/API.md)
