# NetEase expired credentials reported as protocol errors

An expired NetEase login session could appear as `provider-protocol-error`, leaving the stored credential marked `valid`. Reconnect NetEase in Settings to restore the login session, then sync again. The code fix corrects failure classification and reporting; it does not renew an expired credential.

## Observed failure

The last successful production sync completed at **2026-10-15 06:00:57 UTC** (**14:00:57 Asia/Shanghai**). The latest failed request inspected during diagnosis was at **2026-10-17 10:07:47 UTC**. Its stored error was `provider-protocol-error`, its message was only `Provider synchronization failed.`, and it had no Raw Snapshots. The connection still reported a `valid` credential.

A read-only reproduction with the locally configured credential returned this account response:

```json
{ "code": 200, "account": null, "profile": null }
```

That response has no authenticated account. Before the fix, the connector returned the account record alone as a complete collection. Required-source validation then rejected it with:

```text
Provider protocol violation: complete collection omitted required source 'netease.all_time_record'.
```

The reproduction explains the misleading error and matches the production error code and failure before Raw Snapshot persistence. The failed production runs did not persist their upstream response, so their exact account payload cannot be recovered from those records.

## Fix and error reporting

- Recognize the explicit `code: 200` response with both account and profile set to `null` as an expired credential. Stop before requesting account-dependent data.
- Classify other responses without an account identity as `provider-schema-mismatch` for `netease.account` instead of emitting an incomplete collection as complete.
- On Cloudflare, persist `provider-credential-invalid`, mark the connection as requiring attention, and return a message directing the owner to reconnect in Settings. The status dialog also shows this recovery instruction.
- Emit structured `netease_sync_failed` or `netease_sync_retry_wait` logs with the sync run ID, attempt count, failure stage, safe error code and message, retry decision, and elapsed time. The same reporting applies to Steam. Raw upstream messages, payloads, credentials, and arbitrary exception codes are excluded.
- Retain the previous successful data and success timestamp when a later attempt fails. Reconnection and a successful sync remain necessary to recover.

## Verification

Connector regressions cover the empty login response and malformed account identity. SQLite-backed D1 regressions exercise a successful sync followed by expired credentials, schema drift, a retryable upstream failure, or a storage failure. They verify persisted failure details, credential status, structured logs, retention of previous data, and exclusion of credential text from error reports.

The real read-only probe now reports `provider-credential-error` for the same empty account response. Deterministic tests use synthetic credentials and do not require access to a real NetEase account.
