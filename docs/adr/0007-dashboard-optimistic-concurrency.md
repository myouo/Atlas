# ADR 0007: Protect Dashboard mutations with strong revision ETags and database CAS

- Status: Accepted
- Date: 2026-08-23

## Context

Phase 2 owner mutations use last-write-wins behavior. Two tabs can load the same Draft, edit independently, and silently overwrite each other. Immutable revisions provide a natural strong representation identity, but correctness still requires an atomic database precondition rather than an application-only read/compare/update sequence.

ETags solve representation concurrency, not authentication. The Phase 2 production guard remains in force.

## Decision

Represent a revision UUID as the strong ETag:

```http
ETag: "rev:550e8400-e29b-41d4-a716-446655440000"
```

No weak validators or content hashes are used. Owner Draft reads return the ETag. Every mutation of the current Draft, including full Draft save, Widget add/update/delete, Publish, and Restore, requires one strong `If-Match` revision tag.

- Missing `If-Match` returns RFC 9457 `428 Precondition Required`.
- A malformed or weak revision tag returns a safe `400` Problem Details response.
- A well-formed stale tag returns RFC 9457 `412 Precondition Failed` with the current revision UUID, number, and strong ETag.
- Successful mutations return the resulting current Draft ETag. Save/Widget/Restore return a new tag; Publish returns the same Draft tag because Publish creates no content revision.

HTTP tag parsing and formatting remain in the transport/API adapter boundaries. Application and Repository ports deal only in semantic expected revision UUIDs. The Web data-source adapter exposes an opaque concurrency token and maps HTTP 412 to `RevisionConflictError`; `DashboardCanvas`, Widget renderers, and Zustand edit operations never parse HTTP headers.

## Atomic database strategy

Draft content mutations execute inside one transaction:

1. conditionally update the Dashboard row where `current_draft_revision_id = expectedRevisionId`, atomically incrementing `next_revision_number` and acquiring the row lock;
2. if no row is affected, read current revision metadata and return a semantic conflict;
3. insert the new revision and its full Widget snapshot;
4. move the Draft pointer while the same row lock is held;
5. commit.

Concurrent writers with the same expectation cannot both allocate or commit a successor: the first commit changes the pointer, and the second conditional update affects zero rows.

Publish uses one conditional pointer update:

```text
UPDATE dashboards
SET current_published_revision_id = current_draft_revision_id
WHERE id = dashboard
  AND current_draft_revision_id = expectedRevision
```

If another Draft write wins first, Publish affects zero rows and returns conflict. Restore shares the Draft-revision creation path and the same compare-and-swap precondition.

## Frontend conflict behavior

On conflict, the local Zustand Draft and dirty state are preserved. The UI informs the user and offers three explicit choices:

- inspect current server metadata/history;
- deliberately reload the latest server Draft;
- close the conflict UI and keep the local unsaved Draft.

Phase 3 performs no automatic merge, CRDT, OT, or three-way Widget reconciliation.

## Alternatives

- Compare revision IDs in Application code and update later: rejected because another transaction can write between those steps.
- Lock only after reading and then accept any caller token: rejected because stale clients could still overwrite newer state.
- Hash canonicalized JSON: rejected because immutable revision identity already provides a unique strong validator.
- Use database serialization failures as the public contract: rejected because infrastructure errors must map to stable application and RFC 9457 semantics.

## Consequences

- Silent lost updates are prevented across tabs, browsers, and devices.
- Clients must immediately retain every successful response ETag before issuing another mutation.
- Offline/local edits require explicit user resolution after a conflict; Phase 3 intentionally detects and preserves rather than merges.
- Future frontends can implement the same semantics entirely from OpenAPI without knowing the PostgreSQL schema.
