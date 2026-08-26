import { Type } from "typebox";

const ProviderIdSchema = Type.Union([Type.Integer({ minimum: 0 }), Type.String({ minLength: 1 })]);
const NullableStringSchema = Type.Union([Type.Null(), Type.String()]);

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

const AvatarDetailSchema = Type.Union([
  Type.Null(),
  Type.Object(
    {
      identityIconUrl: Type.Optional(Type.String()),
      identityLevel: Type.Optional(Type.Integer({ minimum: 0 })),
      userType: Type.Optional(Type.Integer())
    },
    { additionalProperties: true }
  )
]);

const UserSummarySchema = Type.Object(
  {
    avatarDetail: Type.Optional(AvatarDetailSchema),
    avatarUrl: Type.Optional(Type.String()),
    nickname: Type.String({ minLength: 1 }),
    signature: Type.Optional(Type.Union([Type.Null(), Type.String()])),
    userId: ProviderIdSchema,
    vipType: Type.Optional(Type.Integer({ minimum: 0 }))
  },
  { additionalProperties: true }
);

const PlaylistSchema = Type.Object(
  {
    coverImgUrl: Type.Optional(Type.String()),
    createTime: Type.Optional(Type.Integer({ minimum: 0 })),
    description: Type.Optional(Type.Union([Type.Null(), Type.String()])),
    id: ProviderIdSchema,
    name: Type.String({ minLength: 1 }),
    playCount: Type.Optional(Type.Integer({ minimum: 0 })),
    subscribed: Type.Optional(Type.Boolean()),
    subscribedCount: Type.Optional(Type.Integer({ minimum: 0 })),
    tags: Type.Optional(Type.Array(Type.String())),
    totalDuration: Type.Optional(Type.Integer({ minimum: 0 })),
    trackCount: Type.Optional(Type.Integer({ minimum: 0 })),
    userId: Type.Optional(ProviderIdSchema)
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

export const NeteaseSongDetailResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    songs: Type.Array(NeteaseTrackSchema)
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
    level: Type.Optional(Type.Integer({ minimum: 0 })),
    listenSongs: Type.Integer({ minimum: 0 }),
    profile: Type.Object(
      {
        artistIdentity: Type.Optional(Type.Array(Type.Unknown())),
        avatarDetail: Type.Optional(AvatarDetailSchema),
        avatarUrl: Type.Optional(Type.String()),
        createTime: Type.Optional(Type.Integer({ minimum: 0 })),
        eventCount: Type.Optional(Type.Integer({ minimum: 0 })),
        followeds: Type.Optional(Type.Integer({ minimum: 0 })),
        follows: Type.Optional(Type.Integer({ minimum: 0 })),
        nickname: Type.Optional(Type.String()),
        playlistCount: Type.Optional(Type.Integer({ minimum: 0 })),
        signature: Type.Optional(Type.String()),
        userType: Type.Optional(Type.Integer()),
        vipType: Type.Optional(Type.Integer({ minimum: 0 })),
        userId: Type.Optional(ProviderIdSchema)
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseProfileHomeResponseSchema = NeteaseUserDetailResponseSchema;

export const NeteaseProfileMusicCardsResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        cardLimit: Type.Integer({ minimum: 0 }),
        cardVOList: Type.Array(
          Type.Object(
            {
              canEdit: Type.Boolean(),
              cover: Type.String(),
              extra: Type.Object({}, { additionalProperties: true }),
              id: ProviderIdSchema,
              jumpUrl: Type.String(),
              name: Type.String(),
              resId: Type.String(),
              resType: Type.String({ minLength: 1 })
            },
            { additionalProperties: true }
          )
        ),
        open: Type.Boolean()
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseProfileShowcaseResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        blocks: Type.Array(
          Type.Object(
            {
              blockCode: Type.Optional(NullableStringSchema),
              channel: Type.Optional(NullableStringSchema),
              code: Type.Optional(NullableStringSchema),
              creatives: Type.Optional(Type.Array(Type.Unknown())),
              modulePosition: Type.Optional(Type.Union([Type.Null(), Type.Number()])),
              showType: Type.Optional(NullableStringSchema),
              uiElement: Type.Optional(Type.Unknown())
            },
            { additionalProperties: true }
          )
        ),
        cursor: Type.Optional(
          Type.Union([Type.String({ minLength: 1 }), Type.Record(Type.String(), Type.String())])
        ),
        hasMore: Type.Optional(Type.Boolean())
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseProfileHomeTabsResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        tabs: Type.Array(
          Type.Object(
            {
              tabInfo: Type.Optional(
                Type.Object(
                  {
                    subTitle: Type.Optional(Type.String()),
                    title: Type.Optional(Type.String())
                  },
                  { additionalProperties: true }
                )
              ),
              tabName: Type.String()
            },
            { additionalProperties: true }
          )
        )
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseUserLevelResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        info: Type.Optional(Type.String()),
        level: Type.Integer({ minimum: 0 }),
        nextLoginCount: Type.Optional(Type.Integer({ minimum: 0 })),
        nextPlayCount: Type.Optional(Type.Integer({ minimum: 0 })),
        nowLoginCount: Type.Optional(Type.Integer({ minimum: 0 })),
        nowPlayCount: Type.Optional(Type.Integer({ minimum: 0 })),
        progress: Type.Optional(Type.Number({ minimum: 0 }))
      },
      { additionalProperties: true }
    ),
    full: Type.Optional(Type.Boolean())
  },
  { additionalProperties: true }
);

const MembershipSchema = Type.Union([
  Type.Null(),
  Type.Object(
    {
      expireTime: Type.Optional(Type.Integer({ minimum: 0 })),
      vipCode: Type.Optional(Type.Integer({ minimum: 0 })),
      vipLevel: Type.Optional(Type.Integer({ minimum: 0 }))
    },
    { additionalProperties: true }
  )
]);

export const NeteaseVipInfoResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        albumVip: Type.Optional(MembershipSchema),
        associator: Type.Optional(MembershipSchema),
        musicPackage: Type.Optional(MembershipSchema),
        now: Type.Optional(Type.Integer({ minimum: 0 })),
        redplus: Type.Optional(MembershipSchema),
        redVipAnnualCount: Type.Optional(Type.Integer({ minimum: -1 })),
        redVipLevel: Type.Optional(Type.Integer({ minimum: 0 })),
        voiceBookVip: Type.Optional(MembershipSchema)
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseListenTotalResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      { totalDuration: Type.Integer({ minimum: 0 }) },
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

export const NeteaseAllTimeRecordResponseSchema = Type.Object(
  {
    allData: Type.Array(
      Type.Object(
        {
          playCount: Type.Integer({ minimum: 0 }),
          score: Type.Number({ minimum: 0 }),
          song: NeteaseTrackSchema
        },
        { additionalProperties: true }
      )
    ),
    code: Type.Literal(200)
  },
  { additionalProperties: true }
);

export const NeteaseFollowingResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    follow: Type.Array(UserSummarySchema),
    more: Type.Optional(Type.Boolean()),
    touchCount: Type.Optional(Type.Integer({ minimum: 0 }))
  },
  { additionalProperties: true }
);

export const NeteaseFollowersResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    followeds: Type.Array(UserSummarySchema),
    more: Type.Optional(Type.Boolean()),
    size: Type.Optional(Type.Integer({ minimum: 0 }))
  },
  { additionalProperties: true }
);

export const NeteaseCreatedPlaylistsResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        count: Type.Optional(Type.Integer({ minimum: 0 })),
        more: Type.Optional(Type.Boolean()),
        playlist: Type.Array(PlaylistSchema),
        subCount: Type.Optional(Type.Integer({ minimum: 0 }))
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

const MedalSchema = Type.Object(
  {
    descriptionText: Type.Optional(Type.Union([Type.Null(), Type.String()])),
    medalCode: Type.String({ minLength: 1 }),
    medalLevel: Type.Optional(Type.Union([Type.Null(), Type.Integer({ minimum: 0 })])),
    medalName: Type.String({ minLength: 1 }),
    medalPicUrl: Type.Optional(Type.String()),
    obtainTime: Type.Optional(Type.Union([Type.Null(), Type.Integer({ minimum: 0 })])),
    wear: Type.Optional(Type.Boolean())
  },
  { additionalProperties: true }
);

export const NeteaseMedalsResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object(
      {
        medalNum: Type.Optional(Type.Integer({ minimum: 0 })),
        obtainMedals: Type.Optional(Type.Array(MedalSchema))
      },
      { additionalProperties: true }
    )
  },
  { additionalProperties: true }
);

export const NeteaseSocialStatusResponseSchema = Type.Object(
  {
    code: Type.Literal(200),
    data: Type.Object({}, { additionalProperties: true })
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
