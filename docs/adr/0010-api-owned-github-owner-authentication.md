# ADR 0010: API-owned GitHub OAuth and opaque Owner sessions

- Status: Accepted
- Date: 2026-08-24

## Context

Phase 4 injects a configured `OwnerContext` into every `/v1/me/*` route. That development boundary cannot coexist with real Provider credentials. Authentication must remain owned by the replaceable Nivalis API rather than Next.js, and authorization must distinguish unauthenticated callers from authenticated non-owners.

GitHub documents the OAuth web application flow as authorization redirect, one-time code exchange, then `GET /user` identity validation. GitHub also recommends the durable numeric user `id` rather than mutable login names. OAuth Security BCP recommends Authorization Code with PKCE S256, transaction-specific state, exact redirect matching, and no open redirectors.

## Decision

The Fastify API implements a minimal GitHub OAuth App adapter:

```text
Browser
  ↓ POST /v1/auth/github/start
one-time state hash + encrypted PKCE verifier
  ↓
GitHub Authorization Code + PKCE S256
  ↓ GET /v1/auth/github/callback
exchange code → GET /user → discard GitHub token
  ↓
Actor + opaque Nivalis Session
```

- `OWNER_GITHUB_USER_ID` is the configured stable numeric owner subject. No username is committed or used for authorization.
- Application understands only `Actor`, `actorId`, and role (`owner` or `viewer`). GitHub URLs, token fields, and user response fields stay in the Auth adapter.
- OAuth state is random, stored only as a SHA-256 hash, single-use, and expires quickly. The PKCE verifier is protected using `SecretProtector` with purpose-specific associated data.
- The GitHub access token exists only in callback memory, is used once to resolve `/user`, and is never stored as the Nivalis session.
- Nivalis sessions use random 256-bit opaque tokens. PostgreSQL stores only the token hash. The browser receives `HttpOnly`, `SameSite=Lax`, `Path=/` cookies; production also requires `Secure`.
- Logout revokes the database session and expires the cookie.
- A global HTTP authorization boundary protects every `/v1/me/*` route. Missing/invalid session returns `401`; authenticated non-owner returns `403`.
- Unsafe cookie-authenticated requests require an allowed `Origin`, providing a second CSRF boundary in addition to SameSite cookies.
- Production has no owner bypass. A complete OAuth fixture adapter can be enabled only in development/test and is rejected in production; it exercises the same state/session/cookie flow rather than accepting arbitrary callers.

## Alternatives

- Auth.js/NextAuth: rejected because it binds identity and sessions to the replaceable Web framework.
- GitHub access token as session: rejected because it exposes an external bearer token to every Nivalis request and prevents independent revocation.
- Username allowlist: rejected because usernames can change; GitHub recommends numeric IDs.
- JWT-only session: rejected because logout/revocation and incident response are simpler with opaque server-side sessions.
- Development `ALLOW_ALL`: rejected because it can be deployed accidentally and does not test the real authorization boundary.

## Consequences

- API-mode development needs OAuth configuration, or the explicit test-only OAuth fixture in automated tests.
- Session lookup adds one indexed PostgreSQL read to owner requests.
- Formal multi-user product behavior remains out of scope; viewer actors exist only so authorization can correctly return `403`.
- Authentication solves identity/authorization, while Revision ETags continue to solve concurrency.

## References

- [GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub OAuth app best practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [RFC 9700 OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
