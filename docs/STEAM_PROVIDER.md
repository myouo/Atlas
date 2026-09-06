# Steam Provider

Steam uses the `nivalis.provider-data@2.0` lifecycle on both the PostgreSQL Worker and the
Cloudflare/D1 Worker: encrypted credential → bounded collection → sanitized Raw snapshots →
immutable normalized snapshot → Owner catalog and public Widget projections.

## Connect and display

1. Apply PostgreSQL migration `011_steam_provider.mjs`, or D1 migrations through `0010_normalized_payload_chunks.sql`
   for a Cloudflare installation, before starting the new API and Worker.
2. Run the frontend in API mode and sign in as the Nivalis Owner. Open Settings → Steam.
3. Enter a **SteamID64 as a 17-digit string** and the Web API key registered for your own
   deployment at [Steam's key registration page](https://steamcommunity.com/dev/apikey).
   This is a read-only data connection, not Steam OpenID login or proof of ownership of that ID.
4. Connect and validate. Add the new Steam module to the dashboard, save the draft, synchronize,
   and publish. The original `steam.profile@1` Fixture cards remain readable but are not silently
   converted into real data or automatically republished.
5. In Settings → Steam → **View complete Steam data**, inspect coverage, browse/search the full
   library and recent-game lists, or export the sanitized Owner-only catalog as JSON. This is not
   the public card response and is loaded only when you open the explorer.

The existing `NIVALIS_CREDENTIAL_MASTER_KEY` and `NIVALIS_CREDENTIAL_KEY_ID` protect the key.
Steam does not require an additional plaintext environment secret. The database stores the
SteamID/key pair as one AEAD-protected `steam_web_api` credential. Updating or disconnecting Steam
does not alter NetEase credentials. Deleting a credential retains historical evidence and already
published projections; remove the card and publish if you want to remove that public content.

The frontend's Mock mode disables credential input and does not simulate a successful Steam login.
The legacy `scripts/local-preview-api.ts` remains a NetEase-specific development probe; use the full
API/Worker or Cloudflare deployment for Steam.

## Sources and honest semantics

| Stable source        | Official read operation                    | Meaning                                                                                                         |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `steam.profile`      | `ISteamUser/GetPlayerSummaries/v2`         | Display name, avatar, SteamID64, persona state/visibility; creation, last logoff and current game when returned |
| `steam.library`      | `IPlayerService/GetOwnedGames/v1`          | All returned games including played free games; lifetime/recent/platform minutes and last-played time           |
| `steam.recent`       | `IPlayerService/GetRecentlyPlayedGames/v1` | All returned recent games (`count=0`); public card still displays at most 6                                     |
| `steam.level`        | `IPlayerService/GetSteamLevel/v1`          | Level when returned; otherwise null                                                                             |
| `steam.badges`       | `IPlayerService/GetBadges/v1`              | All returned badges, per-badge level/XP/completion time and account XP/level progress                           |
| `steam.achievements` | `ISteamUserStats/GetPlayerAchievements/v1` | Bounded per-game achievement lists, keys/names/unlock state/time; recent games first, then highest playtime     |

Profile/library/recent sources now produce schema version 2 and accept version 1 evidence for replay.
Level, badges and achievements use source version 1. The normalized/Owner catalog schema is now
version 2, with version 1 snapshots still accepted. Replaying an old 20-item recent source explicitly
marks partial coverage if its reported total exceeded 20; missing new sources remain unavailable.
The public renderer is
`steam.profile@2`. Public disclosure is controlled on the server by `shareProfile`, `shareLibrary`
and `shareRecentGames`. The default shares profile and library summary; recent titles require
explicit selection. The complete owned-game list is never copied into the public summary.
Platform times, logoff/creation/current-game details, badges and achievements are Owner-only; adding
them to collection does not silently expand the public whitelist.

Steam profile/game-detail visibility governs availability. An empty response is **unavailable**, not
an empty library. An explicit zero count is a valid empty collection. Missing playtime is null, not
zero; the aggregate total is unknown if any game's playtime is unknown. Private profiles do not
publish library or recent-game data. The integration does not invent aggregate achievements,
screenshot counts, prices, inventory values, or ownership completeness beyond what Steam returned.

## What “complete” guarantees

- For the library and recent games, the declared count must match every returned unique App ID.
  No UI limit is used as a collection limit. Missing names (for example unavailable app metadata)
  retain the App ID with a clearly marked `nameSource: app_id` fallback instead of dropping a game.
- `coverage` records complete/partial/unavailable/not-collected state, collected and reported counts,
  and reasons. A complete source means this API response was fully retained, **not** that Steam
  revealed hidden games, all licenses/DLC, all-time activity, or deleted records.
- Missing platform times remain null; platform times are never added to lifetime time again.
  `playtimeCoverage` provides known minutes and known/unknown game counts even when the overall
  total cannot be established. Zero-playtime games are distinguished from unknown-playtime games.
- Achievements have an explicit budget of **8 games per synchronization**, prioritized from recent
  activity and then lifetime playtime. Counts refer to returned achievement records for those games,
  never all achievements on the account. Larger libraries remain **partial**; repeated syncs refresh
  the priority set rather than silently claiming to progressively crawl the whole library.
- A game refusing achievement reads, malformed detail, or a transient error remains an explicit
  per-game unavailable result. Enrichment failure does not erase successful core library data.
  Inventory and wishlist are marked **not collected**, not empty or unsupported by Steam as a whole.

This is comprehensive public-profile aggregation, not a complete Steam account export. Full-library
achievement crawling, publisher-only statistics, store pricing, inventory and wishlist require
separate capabilities and collection policies; this implementation does not claim to provide them.

## Transport and failure behavior

- Requests go only to `https://api.steampowered.com`; the key is sent in `x-webapi-key`, never in
  a query string. Redirects are rejected.
- A run reads the profile first, then makes at most three concurrent read requests. Core collection
  makes 5 requests; achievement enrichment adds at most 8. Each has a
  12-second default timeout and a streamed 5 MB response limit. Libraries are capped at 50,000
  returned games; oversized responses fail explicitly, with no silent truncation. Per-game reads
  are restricted to the achievement budget, never proportional to the full library size.
- Unknown/private source fields are removed before Raw persistence, including real name and
  location. SteamID64 never passes through a JavaScript number.
- Rejected profile credentials fail validation. Rate limits, timeouts and server failures use the
  existing bounded retry pipeline. Unavailable optional data is represented explicitly with issues.
- Normalization, schema or transport failures leave the previous successful normalized/native/
  projection state intact. A successful collection that reveals a privacy restriction records
  that restriction instead of copying older public values forward.

API endpoints: `GET /v1/me/providers/steam`, `POST /v1/me/providers/steam/connect`,
`DELETE /v1/me/providers/steam/connection`; synchronization uses the existing
`POST /v1/me/providers/steam/sync` and `GET /v1/me/sync-jobs/{jobId}` contracts.
All connection operations use the existing Owner authentication and mutation-origin checks.
`GET /v1/me/providers/steam/data` returns the versioned full Owner-only catalog and a catalog ETag.

Replay is available with `pnpm provider:replay --provider steam --snapshot <uuid>`.

## Verification

Deterministic transport tests cover header-only credentials, schema drift, mismatched IDs,
private/empty libraries, hidden playtime, size limits, retries, disclosure and protocol JSON Schema
conformance. SQLite-backed D1 tests execute the actual repository and runtime SQL, verify the
migration preserves the existing FK graph and immutable evidence, and check failure retention.
The large-library test uses 12,000 games and 35 recent games, enforces a per-value D1 byte limit,
round-trips multiple stored chunks, verifies public limits remain independent, and rejects missing
chunks. UI tests cover lazy Owner-only fetching, search beyond the first page and coverage labels.
PostgreSQL runtime/replay and HTTP contract integration tests require `TEST_DATABASE_URL`.
Tests use explicit fictional response fixtures; live account validation requires your own key.

The D1 migration rebuilds the affected FK subgraph to widen the old NetEase-only CHECK constraints.
It temporarily copies those tables within the migration transaction, restores original values and
indexes, and retains the immutable-snapshot trigger. Allow headroom for the temporary copy and run
the migration before restarting synchronization. No remote migration is performed by the tests.

D1 migration `0010` adds immutable normalized-payload chunks. Documents above 512 KB are gzip
compressed and split into chunks of at most 512 KB, avoiding D1's 2 MB per-row limit. The Owner
catalog references the same immutable snapshot instead of duplicating large payloads. Reads verify
chunk order/count, decompressed length and SHA-256 before returning normal protocol JSON; storage
references never reach HTTP clients. The 16 MB decoded normalized-document limit and 5 MB network
response limit still apply, and an over-limit run fails without replacing last-known-good data.

Official references: [Web API overview](https://partner.steamgames.com/doc/webapi_overview),
[API-key authentication](https://partner.steamgames.com/doc/webapi_overview/auth),
[ISteamUser](https://partner.steamgames.com/doc/webapi/ISteamUser),
[IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService).
[ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
