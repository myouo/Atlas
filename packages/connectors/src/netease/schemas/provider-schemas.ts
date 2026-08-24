import { Type } from "typebox";

const ProviderIdSchema = Type.Union([Type.Integer({ minimum: 0 }), Type.String({ minLength: 1 })]);

const ArtistSchema = Type.Object(
  { id: ProviderIdSchema, name: Type.String({ minLength: 1 }) },
  { additionalProperties: true }
);

const AlbumSchema = Type.Object(
  {
    id: Type.Optional(ProviderIdSchema),
    name: Type.Optional(Type.String()),
    picUrl: Type.Optional(Type.String())
  },
  { additionalProperties: true }
);

export const NeteaseTrackSchema = Type.Object(
  {
    id: ProviderIdSchema,
    name: Type.String({ minLength: 1 }),
    ar: Type.Array(ArtistSchema, { minItems: 1 }),
    al: Type.Optional(AlbumSchema),
    dt: Type.Optional(Type.Integer({ minimum: 0 }))
  },
  { additionalProperties: true }
);

export const NeteaseAccountResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    account: Type.Object({ id: ProviderIdSchema }, { additionalProperties: true }),
    profile: Type.Optional(
      Type.Object(
        {
          nickname: Type.Optional(Type.String()),
          userId: Type.Optional(ProviderIdSchema)
        },
        { additionalProperties: true }
      )
    )
  },
  { additionalProperties: true }
);

export const NeteaseUserDetailResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    listenSongs: Type.Integer({ minimum: 0 }),
    profile: Type.Object(
      {
        nickname: Type.Optional(Type.String()),
        userId: Type.Optional(ProviderIdSchema)
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseWeeklyRecordResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    weekData: Type.Array(
      Type.Object(
        {
          playCount: Type.Integer({ minimum: 0 }),
          score: Type.Number({ minimum: 0 }),
          song: NeteaseTrackSchema
        },
        { additionalProperties: true }
      )
    )
  },
  { additionalProperties: true }
);

export const NeteaseRecentSongsResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        list: Type.Array(
          Type.Union([
            Type.Object(
              {
                data: NeteaseTrackSchema,
                playTime: Type.Integer({ minimum: 1 }),
                resourceId: Type.Optional(ProviderIdSchema)
              },
              { additionalProperties: true }
            ),
            Type.Object(
              {
                playTime: Type.Integer({ minimum: 1 }),
                resource: NeteaseTrackSchema,
                resourceId: Type.Optional(ProviderIdSchema)
              },
              { additionalProperties: true }
            )
          ])
        ),
        total: Type.Optional(Type.Integer({ minimum: 0 }))
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseListenReportResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        duration: Type.Optional(Type.Number({ minimum: 0 })),
        listenTimeDistributionBlock: Type.Optional(
          Type.Union([
            Type.Null(),
            Type.Object(
              {
                durationDetails: Type.Optional(
                  Type.Array(
                    Type.Object(
                      {
                        duration: Type.Number({ minimum: 0 }),
                        period: Type.String({ minLength: 1 })
                      },
                      { additionalProperties: true }
                    )
                  )
                ),
                listenDays: Type.Optional(Type.Integer({ minimum: 0 })),
                playDuration: Type.Optional(Type.Number({ minimum: 0 }))
              },
              { additionalProperties: true }
            )
          ])
        ),
        period: Type.Optional(Type.Union([Type.Literal("week"), Type.Literal("month")])),
        points: Type.Optional(
          Type.Array(
            Type.Object(
              {
                duration: Type.Number({ minimum: 0 }),
                label: Type.String({ minLength: 1 })
              },
              { additionalProperties: true }
            )
          )
        )
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseQrKeyResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    unikey: Type.Optional(Type.String({ minLength: 1 })),
    data: Type.Optional(
      Type.Object({ unikey: Type.String({ minLength: 1 }) }, { additionalProperties: true })
    )
  },
  { additionalProperties: true }
);

export const NeteaseQrCheckResponseSchema = Type.Object(
  {
    code: Type.Union([Type.Literal(800), Type.Literal(801), Type.Literal(802), Type.Literal(803)])
  },
  { additionalProperties: true }
);

export const NeteaseAuthResponseSchema = Type.Object(
  { code: Type.Integer() },
  { additionalProperties: true }
);
