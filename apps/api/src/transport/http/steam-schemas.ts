import { Type } from "@fastify/type-provider-typebox";

const NullableCount = Type.Union([
  Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  Type.Null()
]);
const Unavailable = Type.Object(
  {
    availability: Type.Literal("unavailable"),
    reason: Type.Union([
      Type.Literal("not_synced"),
      Type.Literal("private"),
      Type.Literal("not_returned"),
      Type.Literal("not_shared")
    ])
  },
  { additionalProperties: false }
);
export const SteamConnectInputSchema = Type.Object(
  {
    steamId: Type.String({ minLength: 1, maxLength: 512 }),
    apiKey: Type.String({ pattern: "^[a-fA-F0-9]{32}$" })
  },
  { additionalProperties: false }
);
const Game = Type.Object(
  {
    appId: Type.Integer({ minimum: 1, maximum: 0xffffffff }),
    name: Type.String(),
    iconUrl: Type.Union([Type.String({ format: "uri" }), Type.Null()]),
    storeUrl: Type.String({ format: "uri" }),
    playtimeMinutes: NullableCount,
    recentPlaytimeMinutes: NullableCount
  },
  { additionalProperties: false }
);
export const SteamProfileDataV2Schema = Type.Object(
  {
    provider: Type.Literal("steam"),
    account: Type.Union([
      Unavailable,
      Type.Object(
        {
          availability: Type.Literal("available"),
          steamId: Type.String({ pattern: "^[0-9]{17}$" }),
          displayName: Type.String(),
          profileUrl: Type.String({ format: "uri" }),
          avatarUrl: Type.Union([Type.String({ format: "uri" }), Type.Null()]),
          personaState: NullableCount,
          visibility: Type.Integer({ minimum: 0, maximum: 3 }),
          level: NullableCount
        },
        { additionalProperties: false }
      )
    ]),
    library: Type.Union([
      Unavailable,
      Type.Object(
        {
          availability: Type.Literal("available"),
          gameCount: Type.Integer({ minimum: 0 }),
          playtimeMinutes: NullableCount,
          playedGameCount: NullableCount
        },
        { additionalProperties: false }
      )
    ]),
    recentGames: Type.Union([
      Unavailable,
      Type.Object(
        {
          availability: Type.Literal("available"),
          totalCount: Type.Integer({ minimum: 0 }),
          items: Type.Array(Game, { maxItems: 6 })
        },
        { additionalProperties: false }
      )
    ])
  },
  { additionalProperties: false }
);
