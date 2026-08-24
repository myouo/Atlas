# ADR 0011: Protect Provider credentials with versioned AEAD envelopes

- Status: Accepted
- Date: 2026-08-24

## Context

Phase 5 introduces the first real Provider secret (`MUSIC_U`). Plaintext cannot enter PostgreSQL, API responses, logs, Raw Snapshots, Git, or the frontend's durable state. The API must encrypt credentials while the independent Worker can decrypt them after restart. Wrong or rotated keys must fail one SyncRun safely rather than crash the process.

## Decision

Application depends on two provider-neutral ports:

- `ProviderCredentialStore`: encrypted envelope lifecycle and public status only;
- `SecretProtector`: protect/unprotect opaque secret bytes with a purpose-bound context.

The Node infrastructure adapter uses AES-256-GCM:

```text
NIVALIS_CREDENTIAL_MASTER_KEY (32 bytes, environment only)
        + random 96-bit nonce
        + AAD(ownerId, connectionId, purpose, credentialType, encryptionVersion, keyId)
        ↓
ciphertext + 128-bit auth tag
```

`provider_credentials` stores separate binary `ciphertext`, `nonce`, and `auth_tag` fields plus `encryption_version`, `key_id`, status, and timestamps. It never stores the master key or plaintext. One connection and credential type has at most one current envelope.

- The master key is accepted only from environment configuration and must decode to exactly 32 bytes.
- `key_id` and `encryption_version` make later rotation/migration explicit.
- Associated data binds ciphertext to its connection and credential type, preventing row swapping.
- Decryption/authentication failure maps to a non-retryable `ProviderCredentialError`; persisted/API messages are generic and never contain the secret or cryptographic material.
- Connect replaces the encrypted credential and sets `pending_validation`. Successful Worker sync marks it `valid`; authentication failures mark `expired` or `invalid` without retry.
- Disconnect disables the Provider connection and deletes only the credential envelope. Raw/native/projection history remains until a future explicit data-deletion operation.
- Credential APIs return configuration/status/timestamps only. Secret values are write-only and immediately cleared from Web component state after submission.
- OAuth PKCE verifiers reuse the same protector with a different AAD purpose, but are short-lived and stored separately from Provider credentials.

## Alternatives

- Plaintext JSONB or environment-only `MUSIC_U`: rejected because it prevents per-connection lifecycle and restart-safe owner management.
- Hashing the credential: rejected because the Worker must recover the original bearer credential.
- AES-CBC without authentication: rejected because undetected ciphertext modification is unacceptable.
- Store the master key in PostgreSQL: rejected because database compromise would disclose both key and ciphertext.
- Provider-specific encryption inside `NeteaseConnector`: rejected because key management is generic infrastructure, while credential interpretation remains Provider-specific.

## Consequences

- Losing the master key makes stored credentials intentionally unrecoverable; reconnect is required.
- Key rotation needs a future explicit rewrap operation.
- Database backups contain ciphertext but still require normal access controls and retention policy.

## References

- [Node.js Crypto API](https://nodejs.org/api/crypto.html)
