# Steam Provider

Steam uses the `nivalis.provider-data@2.0` lifecycle on both the PostgreSQL Worker and the
Cloudflare/D1 Worker: encrypted credential → bounded collection → sanitized Raw snapshots →
immutable normalized snapshot → Owner catalog and public Widget projections.

## Connect and display

1. Apply PostgreSQL migration `011_steam_provider.mjs`, or D1 migration `0009_steam_provider.sql`
   for a Cloudflare installation, before starting the new API and Worker.
2. Run the frontend in API mode and sign in as the Nivalis Owner. Open Settings → Steam.
3. Enter a **SteamID64 as a 17-digit string** and the Web API key registered for your own
   deployment at [Steam's key registration page](https://steamcommunity.com/dev/apikey).
   This is a read-only data connection, not Steam OpenID login or proof of ownership of that ID.
4. Connect and validate. Add the new Steam module to the dashboard, save the draft, synchronize,
   and publish. The original `steam.profile@1` Fixture cards remain readable but are not silently
   converted into real data or automatically republished.

The existing `NIVALIS_CREDENTIAL_MASTER_KEY` and `NIVALIS_CREDENTIAL_KEY_ID` protect the key.
Steam does not require an additional plaintext environment secret. The database stores the
SteamID/key pair as one AEAD-protected `steam_web_api` credential. Updating or disconnecting Steam
does not alter NetEase credentials. Deleting a credential retains historical evidence and already
published projections; remove the card and publish if you want to remove that public content.

The frontend's Mock mode disables credential input and does not simulate a successful Steam login.
The legacy `scripts/local-preview-api.ts` remains a NetEase-specific development probe; use the full
API/Worker or Cloudflare deployment for Steam.

## Sources and honest semantics

| Stable source   | Official read operation                    | Meaning                                                                |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `steam.profile` | `ISteamUser/GetPlayerSummaries/v2`         | Display name, public avatar, SteamID64, persona state and visibility   |
| `steam.library` | `IPlayerService/GetOwnedGames/v1`          | Exposed game library, including played free games; playtime in minutes |
| `steam.recent`  | `IPlayerService/GetRecentlyPlayedGames/v1` | Up to 20 recently played games collected; up to 6 publicly projected   |
| `steam.level`   | `IPlayerService/GetSteamLevel/v1`          | Level when returned; otherwise null                                    |

All four source schemas and the normalized schema start at version 1. The public renderer is
`steam.profile@2`. Public disclosure is controlled on the server by `shareProfile`, `shareLibrary`
and `shareRecentGames`. The default shares profile and library summary; recent titles require
explicit selection. The complete owned-game list is never copied into the public summary.

Steam profile/game-detail visibility governs availability. An empty response is **unavailable**, not
an empty library. An explicit zero count is a valid empty collection. Missing playtime is null, not
zero; the aggregate total is unknown if any game's playtime is unknown. Private profiles do not
publish library or recent-game data. The integration does not invent aggregate achievements,
screenshot counts, prices, inventory values, or ownership completeness beyond what Steam returned.

## Transport and failure behavior

- Requests go only to `https://api.steampowered.com`; the key is sent in `x-webapi-key`, never in
  a query string. Redirects are rejected.
- A run reads the profile first, then makes at most three concurrent read requests. Each has a
  12-second default timeout and a streamed 5 MB response limit. Libraries are capped at 50,000
  returned games; oversized responses fail explicitly. There is no per-game request fan-out.
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

Replay is available with `pnpm provider:replay --provider steam --snapshot <uuid>`.

## Verification

Deterministic transport tests cover header-only credentials, schema drift, mismatched IDs,
private/empty libraries, hidden playtime, size limits, retries, disclosure and protocol JSON Schema
conformance. SQLite-backed D1 tests execute the actual repository and runtime SQL, verify the
migration preserves the existing FK graph and immutable evidence, and check failure retention.
PostgreSQL runtime/replay and HTTP contract integration tests require `TEST_DATABASE_URL`.
Tests use explicit fictional response fixtures; live account validation requires your own key.

The D1 migration rebuilds the affected FK subgraph to widen the old NetEase-only CHECK constraints.
It temporarily copies those tables within the migration transaction, restores original values and
indexes, and retains the immutable-snapshot trigger. Allow headroom for the temporary copy and run
the migration before restarting synchronization. No remote migration is performed by the tests.

Official references: [Web API overview](https://partner.steamgames.com/doc/webapi_overview),
[API-key authentication](https://partner.steamgames.com/doc/webapi_overview/auth),
[ISteamUser](https://partner.steamgames.com/doc/webapi/ISteamUser),
[IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService).
