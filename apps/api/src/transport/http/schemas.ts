import { Type } from "@fastify/type-provider-typebox";

const JsonObjectSchema = Type.Object({}, { additionalProperties: true });
export const RedirectResponseSchema = Type.Any();

export const AuthStartSchema = Type.Object(
  {
    authorizationUrl: Type.String({ format: "uri" }),
    expiresAt: Type.String({ format: "date-time" })
  },
  { additionalProperties: false }
);

export const AuthCallbackQuerySchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    state: Type.String({ minLength: 32 })
  },
  { additionalProperties: false }
);

export const AuthSessionSchema = Type.Object(
  {
    actorId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    authenticated: Type.Boolean(),
    expiresAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    role: Type.Union([Type.Literal("owner"), Type.Literal("viewer"), Type.Null()])
  },
  { additionalProperties: false }
);

export const CredentialStatusSchema = Type.Union([
  Type.Literal("not_configured"),
  Type.Literal("pending_validation"),
  Type.Literal("valid"),
  Type.Literal("expired"),
  Type.Literal("invalid"),
  Type.Literal("revoked")
]);

export const ProviderConnectionSchema = Type.Object(
  {
    configured: Type.Boolean(),
    credentialStatus: CredentialStatusSchema,
    credentialUpdatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    displayName: Type.Union([Type.String(), Type.Null()]),
    enabled: Type.Boolean(),
    lastValidatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    provider: Type.Literal("netease"),
    providerAccountId: Type.Union([Type.String(), Type.Null()])
  },
  { additionalProperties: false }
);

export const NeteaseConnectInputSchema = Type.Object(
  {
    credential: Type.String({ minLength: 16, maxLength: 4_096 }),
    credentialType: Type.Literal("music_u")
  },
  { additionalProperties: false }
);

export const ProviderAuthAttemptStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("preparing"),
  Type.Literal("waiting_for_scan"),
  Type.Literal("waiting_for_confirmation"),
  Type.Literal("waiting_for_code"),
  Type.Literal("verifying"),
  Type.Literal("connected"),
  Type.Literal("expired"),
  Type.Literal("failed")
]);

export const ProviderAuthAttemptSchema = Type.Object(
  {
    attemptId: Type.String({ format: "uuid" }),
    createdAt: Type.String({ format: "date-time" }),
    expiresAt: Type.String({ format: "date-time" }),
    lastErrorCode: Type.Union([Type.String(), Type.Null()]),
    lastErrorMessage: Type.Union([Type.String(), Type.Null()]),
    maskedPhone: Type.Union([Type.String(), Type.Null()]),
    method: Type.Union([Type.Literal("qr"), Type.Literal("sms_otp")]),
    provider: Type.Literal("netease"),
    qrUrl: Type.Union([Type.String({ format: "uri" }), Type.Null()]),
    resendAfter: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    status: ProviderAuthAttemptStatusSchema,
    updatedAt: Type.String({ format: "date-time" })
  },
  { additionalProperties: false }
);

export const ProviderAuthAttemptParamsSchema = Type.Object(
  { attemptId: Type.String({ format: "uuid" }) },
  { additionalProperties: false }
);

export const NeteaseSmsAuthInputSchema = Type.Object(
  {
    countryCode: Type.String({ pattern: "^[0-9]{1,4}$" }),
    phone: Type.String({ pattern: "^[0-9]{5,20}$" })
  },
  { additionalProperties: false }
);

export const NeteaseSmsVerifyInputSchema = Type.Object(
  { code: Type.String({ pattern: "^[0-9]{4,8}$" }) },
  { additionalProperties: false }
);

export const ProfileSchema = Type.Object(
  {
    displayName: Type.String(),
    handle: Type.String(),
    headline: Type.String(),
    bio: Type.String(),
    avatarUrl: Type.String(),
    tags: Type.Array(Type.String())
  },
  { additionalProperties: false }
);

export const LayoutItemSchema = Type.Object(
  {
    i: Type.String({ minLength: 1 }),
    x: Type.Integer({ minimum: 0 }),
    y: Type.Integer({ minimum: 0 }),
    w: Type.Integer({ minimum: 1 }),
    h: Type.Integer({ minimum: 1 })
  },
  { additionalProperties: false }
);

export const ResponsiveLayoutSchema = Type.Object(
  {
    lg: Type.Array(LayoutItemSchema),
    md: Type.Array(LayoutItemSchema),
    sm: Type.Array(LayoutItemSchema)
  },
  { additionalProperties: false }
);

export const ProviderSchema = Type.Union([
  Type.Literal("fixture"),
  Type.Literal("netease"),
  Type.Literal("github"),
  Type.Literal("bangumi"),
  Type.Literal("steam"),
  Type.Literal("bilibili")
]);

const widgetConfigurationProperties = {
  dataConfig: JsonObjectSchema,
  enabled: Type.Boolean(),
  id: Type.String({ format: "uuid" }),
  presentationConfig: JsonObjectSchema,
  provider: ProviderSchema,
  schemaVersion: Type.Integer({ minimum: 1 }),
  title: Type.String({ minLength: 1 })
};

const WidgetTypeSchema = Type.Union([
  Type.Literal("profile.hero"),
  Type.Literal("system.stats"),
  Type.Literal("music.netease.overview"),
  Type.Literal("music.netease.identity"),
  Type.Literal("music.netease.listening"),
  Type.Literal("music.netease.calendar"),
  Type.Literal("music.netease.ranking"),
  Type.Literal("music.netease.social"),
  Type.Literal("music.netease.playlists"),
  Type.Literal("music.netease.showcase"),
  Type.Literal("github.profile"),
  Type.Literal("bilibili.profile"),
  Type.Literal("steam.profile"),
  Type.Literal("bangumi.collection")
]);

export const WidgetConfigurationSchema = Type.Object(
  {
    ...widgetConfigurationProperties,
    type: WidgetTypeSchema
  },
  { additionalProperties: false }
);

const widgetEnvelopeProperties = {
  ...widgetConfigurationProperties,
  updatedAt: Type.String({ format: "date-time" }),
  stale: Type.Boolean()
};

const SystemStatDataSchema = Type.Object(
  {
    metric: Type.Union([
      Type.Literal("uptime_days"),
      Type.Literal("providers_connected"),
      Type.Literal("sync_completeness"),
      Type.Literal("records_collected")
    ]),
    value: Type.Number(),
    unit: Type.Union([
      Type.Literal("days"),
      Type.Literal("providers"),
      Type.Literal("percent"),
      Type.Literal("records")
    ])
  },
  { additionalProperties: false }
);

const ArtistSummarySchema = Type.Object(
  { name: Type.String(), avatarUrl: Type.String() },
  { additionalProperties: false }
);

const GenreShareSchema = Type.Object(
  { name: Type.String(), share: Type.Number({ minimum: 0, maximum: 1 }) },
  { additionalProperties: false }
);

const TrendPointSchema = Type.Object(
  { label: Type.String(), value: Type.Number({ minimum: 0 }) },
  { additionalProperties: false }
);

const NeteaseOverviewDataSchema = Type.Object(
  {
    range: Type.Union([Type.Literal("7d"), Type.Literal("30d"), Type.Literal("year")]),
    plays: Type.Integer({ minimum: 0 }),
    minutes: Type.Integer({ minimum: 0 }),
    dailyAverage: Type.Integer({ minimum: 0 }),
    change: Type.Number(),
    topArtists: Type.Array(ArtistSummarySchema),
    genres: Type.Array(GenreShareSchema),
    trend: Type.Array(TrendPointSchema)
  },
  { additionalProperties: false }
);

const DataUnavailableSchema = Type.Object(
  {
    availability: Type.Literal("unavailable"),
    reason: Type.Union([
      Type.Literal("not_synced"),
      Type.Literal("provider_omitted"),
      Type.Literal("unsupported"),
      Type.Literal("insufficient_coverage"),
      Type.Literal("schema_unavailable"),
      Type.Literal("not_public"),
      Type.Literal("resource_not_found")
    ])
  },
  { additionalProperties: false }
);

const NeteaseArtistV2Schema = Type.Object(
  { providerArtistId: Type.String(), name: Type.String() },
  { additionalProperties: false }
);

const NeteaseTrackSummaryV2Schema = Type.Object(
  {
    providerTrackId: Type.String(),
    name: Type.String(),
    artists: Type.Array(NeteaseArtistV2Schema),
    albumName: Type.Union([Type.String(), Type.Null()]),
    coverUrl: Type.Union([Type.String({ format: "uri" }), Type.Null()]),
    durationMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])
  },
  { additionalProperties: false }
);

const NeteaseMetricAvailableV2Schema = Type.Object(
  {
    availability: Type.Literal("available"),
    value: Type.Number({ minimum: 0 }),
    unit: Type.Union([Type.Literal("plays"), Type.Literal("minutes")]),
    provenance: Type.Union([Type.Literal("provider_reported"), Type.Literal("nivalis_derived")])
  },
  { additionalProperties: false }
);

const NeteaseAccountAvailableV2Schema = Type.Object(
  {
    availability: Type.Literal("available"),
    providerUserId: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()])
  },
  { additionalProperties: false }
);

const NeteaseWeeklyAvailableV2Schema = Type.Object(
  {
    availability: Type.Literal("available"),
    period: Type.Literal("provider_week"),
    coverage: Type.Literal("top_records"),
    provenance: Type.Literal("nivalis_derived"),
    rankedPlayCount: Type.Integer({ minimum: 0 }),
    topTracks: Type.Array(
      Type.Object(
        {
          track: NeteaseTrackSummaryV2Schema,
          playCount: Type.Integer({ minimum: 0 }),
          score: Type.Number({ minimum: 0 })
        },
        { additionalProperties: false }
      )
    ),
    topArtists: Type.Array(
      Type.Object(
        {
          providerArtistId: Type.String(),
          name: Type.String(),
          rankedPlayCount: Type.Integer({ minimum: 0 })
        },
        { additionalProperties: false }
      )
    )
  },
  { additionalProperties: false }
);

const NeteaseRecentAvailableV2Schema = Type.Object(
  {
    availability: Type.Literal("available"),
    coverage: Type.Literal("provider_recent_limit"),
    provenance: Type.Literal("provider_reported"),
    items: Type.Array(
      Type.Object(
        {
          track: NeteaseTrackSummaryV2Schema,
          playedAt: Type.String({ format: "date-time" })
        },
        { additionalProperties: false }
      )
    )
  },
  { additionalProperties: false }
);

const NeteaseTrendAvailableV2Schema = Type.Object(
  {
    availability: Type.Literal("available"),
    coverage: Type.Union([Type.Literal("provider_week"), Type.Literal("provider_report")]),
    provenance: Type.Union([Type.Literal("provider_reported"), Type.Literal("nivalis_derived")]),
    points: Type.Array(
      Type.Object(
        { label: Type.String(), minutes: Type.Number({ minimum: 0 }) },
        { additionalProperties: false }
      )
    )
  },
  { additionalProperties: false }
);

const NeteaseOverviewDataV2Schema = Type.Object(
  {
    provider: Type.Literal("netease"),
    account: Type.Union([NeteaseAccountAvailableV2Schema, DataUnavailableSchema]),
    totalListenCount: Type.Union([NeteaseMetricAvailableV2Schema, DataUnavailableSchema]),
    weeklyListening: Type.Union([NeteaseWeeklyAvailableV2Schema, DataUnavailableSchema]),
    recentListening: Type.Union([NeteaseRecentAvailableV2Schema, DataUnavailableSchema]),
    listeningDuration: Type.Union([NeteaseMetricAvailableV2Schema, DataUnavailableSchema]),
    trend: Type.Union([NeteaseTrendAvailableV2Schema, DataUnavailableSchema])
  },
  { additionalProperties: false }
);

const GithubProfileDataSchema = Type.Object(
  {
    handle: Type.String(),
    repositories: Type.Integer({ minimum: 0 }),
    stars: Type.Integer({ minimum: 0 }),
    followers: Type.Integer({ minimum: 0 }),
    contributions: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

const BilibiliProfileDataSchema = Type.Object(
  {
    level: Type.Integer({ minimum: 0 }),
    following: Type.Integer({ minimum: 0 }),
    followers: Type.Integer({ minimum: 0 }),
    views: Type.Integer({ minimum: 0 }),
    likes: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

const SteamProfileDataSchema = Type.Object(
  {
    level: Type.Integer({ minimum: 0 }),
    games: Type.Integer({ minimum: 0 }),
    playtimeHours: Type.Integer({ minimum: 0 }),
    achievements: Type.Integer({ minimum: 0 }),
    screenshots: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

const BangumiCollectionDataSchema = Type.Object(
  {
    level: Type.Integer({ minimum: 0 }),
    entries: Type.Integer({ minimum: 0 }),
    watched: Type.Integer({ minimum: 0 }),
    watching: Type.Integer({ minimum: 0 }),
    reviews: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

export const ProfileHeroWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("profile.hero"),
    schemaVersion: Type.Literal(1),
    data: ProfileSchema
  },
  { additionalProperties: false }
);

export const SystemStatsWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("system.stats"),
    schemaVersion: Type.Literal(1),
    data: SystemStatDataSchema
  },
  { additionalProperties: false }
);

export const NeteaseOverviewWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("music.netease.overview"),
    schemaVersion: Type.Literal(1),
    data: NeteaseOverviewDataSchema
  },
  { additionalProperties: false }
);

export const NeteaseOverviewWidgetV2Schema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("music.netease.overview"),
    provider: Type.Literal("netease"),
    schemaVersion: Type.Literal(2),
    data: NeteaseOverviewDataV2Schema
  },
  { additionalProperties: false }
);

const neteaseWidget = (type: string, schemaVersion: 1 | 2 = 1) =>
  Type.Object(
    {
      ...widgetEnvelopeProperties,
      type: Type.Literal(type),
      provider: Type.Literal("netease"),
      schemaVersion: Type.Literal(schemaVersion),
      data: JsonObjectSchema
    },
    { additionalProperties: false }
  );

export const NeteaseIdentityWidgetV1Schema = neteaseWidget("music.netease.identity");
export const NeteaseListeningWidgetV1Schema = neteaseWidget("music.netease.listening");
export const NeteaseListeningCalendarWidgetV1Schema = neteaseWidget("music.netease.calendar");
export const NeteaseRankingWidgetV1Schema = neteaseWidget("music.netease.ranking");
export const NeteaseRankingWidgetV2Schema = neteaseWidget("music.netease.ranking", 2);
export const NeteaseSocialWidgetV1Schema = neteaseWidget("music.netease.social");
export const NeteasePlaylistsWidgetV1Schema = neteaseWidget("music.netease.playlists");
export const NeteaseShowcaseWidgetV1Schema = neteaseWidget("music.netease.showcase");
export const NeteaseShowcaseWidgetV2Schema = neteaseWidget("music.netease.showcase", 2);

export const NeteaseDataCatalogSchema = Type.Object(
  {
    catalog: JsonObjectSchema,
    dataVersion: Type.String({ format: "uuid" }),
    generatedAt: Type.String({ format: "date-time" }),
    provider: Type.Literal("netease"),
    schemaVersion: Type.Literal(1)
  },
  { additionalProperties: false }
);

export const GithubProfileWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("github.profile"),
    schemaVersion: Type.Literal(1),
    data: GithubProfileDataSchema
  },
  { additionalProperties: false }
);

export const BilibiliProfileWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("bilibili.profile"),
    schemaVersion: Type.Literal(1),
    data: BilibiliProfileDataSchema
  },
  { additionalProperties: false }
);

export const SteamProfileWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("steam.profile"),
    schemaVersion: Type.Literal(1),
    data: SteamProfileDataSchema
  },
  { additionalProperties: false }
);

export const BangumiCollectionWidgetSchema = Type.Object(
  {
    ...widgetEnvelopeProperties,
    type: Type.Literal("bangumi.collection"),
    schemaVersion: Type.Literal(1),
    data: BangumiCollectionDataSchema
  },
  { additionalProperties: false }
);

export const WidgetProjectionSchema = Type.Union([
  ProfileHeroWidgetSchema,
  SystemStatsWidgetSchema,
  NeteaseOverviewWidgetSchema,
  NeteaseOverviewWidgetV2Schema,
  NeteaseIdentityWidgetV1Schema,
  NeteaseListeningWidgetV1Schema,
  NeteaseListeningCalendarWidgetV1Schema,
  NeteaseRankingWidgetV1Schema,
  NeteaseRankingWidgetV2Schema,
  NeteaseSocialWidgetV1Schema,
  NeteasePlaylistsWidgetV1Schema,
  NeteaseShowcaseWidgetV1Schema,
  NeteaseShowcaseWidgetV2Schema,
  GithubProfileWidgetSchema,
  BilibiliProfileWidgetSchema,
  SteamProfileWidgetSchema,
  BangumiCollectionWidgetSchema
]);

const dashboardConfigurationProperties = {
  dashboardId: Type.Literal("about"),
  revision: Type.Integer({ minimum: 1 }),
  profile: ProfileSchema,
  layout: ResponsiveLayoutSchema,
  widgets: Type.Array(WidgetConfigurationSchema)
};

const dashboardReadModelProperties = {
  ...dashboardConfigurationProperties,
  widgets: Type.Array(WidgetProjectionSchema)
};

export const DashboardReadModelSchema = Type.Object(dashboardReadModelProperties, {
  additionalProperties: false
});

export const DashboardStateSchema = Type.Object(
  {
    ...dashboardConfigurationProperties,
    revisionId: Type.String({ format: "uuid" }),
    state: Type.Union([Type.Literal("draft"), Type.Literal("published")]),
    updatedAt: Type.String({ format: "date-time" })
  },
  { additionalProperties: false }
);

export const DashboardRevisionOperationSchema = Type.Union([
  Type.Literal("initial_migration"),
  Type.Literal("seed"),
  Type.Literal("save"),
  Type.Literal("widget_add"),
  Type.Literal("widget_update"),
  Type.Literal("widget_delete"),
  Type.Literal("restore"),
  Type.Literal("schema_upgrade")
]);

const nullableRevisionIdSchema = Type.Union([Type.String({ format: "uuid" }), Type.Null()]);

export const DashboardRevisionMetadataSchema = Type.Object(
  {
    revisionId: Type.String({ format: "uuid" }),
    revisionNumber: Type.Integer({ minimum: 1 }),
    parentRevisionId: nullableRevisionIdSchema,
    restoredFromRevisionId: nullableRevisionIdSchema,
    operation: DashboardRevisionOperationSchema,
    createdAt: Type.String({ format: "date-time" }),
    isCurrentDraft: Type.Boolean(),
    isCurrentPublished: Type.Boolean()
  },
  { additionalProperties: false }
);

export const DashboardRevisionListSchema = Type.Object(
  {
    items: Type.Array(DashboardRevisionMetadataSchema),
    nextCursor: Type.Union([Type.String({ pattern: "^rev:[1-9][0-9]*$" }), Type.Null()])
  },
  { additionalProperties: false }
);

export const DashboardRevisionDetailSchema = Type.Object(
  {
    dashboardId: Type.Literal("about"),
    revisionId: Type.String({ format: "uuid" }),
    revisionNumber: Type.Integer({ minimum: 1 }),
    parentRevisionId: nullableRevisionIdSchema,
    restoredFromRevisionId: nullableRevisionIdSchema,
    operation: DashboardRevisionOperationSchema,
    createdAt: Type.String({ format: "date-time" }),
    isCurrentDraft: Type.Boolean(),
    isCurrentPublished: Type.Boolean(),
    profile: ProfileSchema,
    layout: ResponsiveLayoutSchema,
    widgets: Type.Array(WidgetConfigurationSchema)
  },
  { additionalProperties: false }
);

export const DashboardDraftUpdateSchema = Type.Object(
  {
    layout: ResponsiveLayoutSchema,
    widgets: Type.Array(WidgetConfigurationSchema)
  },
  { additionalProperties: false }
);

export const WidgetPlacementSchema = Type.Object(
  { lg: LayoutItemSchema, md: LayoutItemSchema, sm: LayoutItemSchema },
  { additionalProperties: false }
);

export const CreateWidgetInputSchema = Type.Object(
  { widget: WidgetConfigurationSchema, placement: WidgetPlacementSchema },
  { additionalProperties: false }
);

export const UpdateWidgetInputSchema = Type.Object(
  {
    title: Type.Optional(Type.String({ minLength: 1 })),
    dataConfig: Type.Optional(JsonObjectSchema),
    presentationConfig: Type.Optional(JsonObjectSchema),
    enabled: Type.Optional(Type.Boolean())
  },
  { additionalProperties: false, minProperties: 1 }
);

export const WidgetIdParamsSchema = Type.Object(
  { widgetId: Type.String({ format: "uuid" }) },
  { additionalProperties: false }
);

export const RevisionIdParamsSchema = Type.Object(
  { revisionId: Type.String({ format: "uuid" }) },
  { additionalProperties: false }
);

export const RevisionListQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ pattern: "^rev:[1-9][0-9]*$" })),
    limit: Type.Optional(Type.Integer({ default: 20, maximum: 100, minimum: 1 }))
  },
  { additionalProperties: false }
);

export const IfMatchHeadersSchema = Type.Object(
  { "if-match": Type.Optional(Type.String()) },
  { additionalProperties: true }
);

export const ProviderParamsSchema = Type.Object(
  { provider: ProviderSchema },
  { additionalProperties: false }
);

export const JobParamsSchema = Type.Object(
  { jobId: Type.String({ format: "uuid" }) },
  { additionalProperties: false }
);

export const ProviderStatusSchema = Type.Object(
  {
    provider: ProviderSchema,
    connection: Type.Union([
      Type.Literal("fixture"),
      Type.Literal("connected"),
      Type.Literal("not_connected"),
      Type.Literal("requires_attention"),
      Type.Literal("disabled")
    ]),
    credentialStatus: CredentialStatusSchema,
    syncStatus: Type.Union([
      Type.Literal("idle"),
      Type.Literal("queued"),
      Type.Literal("running"),
      Type.Literal("retrying"),
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("credential_invalid")
    ]),
    attemptCount: Type.Integer({ minimum: 0 }),
    lastAttemptAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    lastSuccessAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    lastErrorCode: Type.Union([Type.String(), Type.Null()]),
    lastErrorMessage: Type.Union([Type.String(), Type.Null()])
  },
  { additionalProperties: false }
);

export const ProviderStatusListSchema = Type.Object(
  { providers: Type.Array(ProviderStatusSchema) },
  { additionalProperties: false }
);

export const WidgetProjectionVersionSchema = Type.Object(
  {
    widgetId: Type.String({ format: "uuid" }),
    projectionKey: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    projectionVersion: Type.Union([Type.String({ format: "uuid" }), Type.Null()])
  },
  { additionalProperties: false }
);

export const DashboardLiveDataSchema = Type.Object(
  {
    dashboardId: Type.Literal("about"),
    configurationRevisionId: Type.String({ format: "uuid" }),
    generatedAt: Type.String({ format: "date-time" }),
    widgets: Type.Array(WidgetProjectionSchema),
    projectionVersions: Type.Array(WidgetProjectionVersionSchema)
  },
  { additionalProperties: false }
);

export const SyncJobSchema = Type.Object(
  {
    jobId: Type.String({ format: "uuid" }),
    provider: ProviderSchema,
    status: Type.Union([
      Type.Literal("queued"),
      Type.Literal("running"),
      Type.Literal("retrying"),
      Type.Literal("completed"),
      Type.Literal("failed")
    ]),
    attemptCount: Type.Integer({ minimum: 0 }),
    requestedAt: Type.String({ format: "date-time" }),
    startedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    lastErrorCode: Type.Union([Type.String(), Type.Null()]),
    lastErrorMessage: Type.Union([Type.String(), Type.Null()])
  },
  { additionalProperties: false }
);

export const ProviderConnectionListSchema = Type.Object(
  { providers: Type.Array(ProviderConnectionSchema) },
  { additionalProperties: false }
);

export const ProviderConnectAcceptedSchema = Type.Object(
  {
    connection: ProviderConnectionSchema,
    validationJob: SyncJobSchema
  },
  { additionalProperties: false }
);

export const HealthStatusSchema = Type.Object(
  { status: Type.Literal("ok"), requestId: Type.String() },
  { additionalProperties: false }
);

export const ReadinessStatusSchema = Type.Object(
  {
    status: Type.Literal("ready"),
    database: Type.Literal("reachable"),
    requestId: Type.String()
  },
  { additionalProperties: false }
);

export const ProblemDetailsSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    detail: Type.Optional(Type.String()),
    instance: Type.Optional(Type.String()),
    requestId: Type.Optional(Type.String())
  },
  { additionalProperties: true }
);

export const RevisionConflictProblemSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Literal(412),
    detail: Type.Optional(Type.String()),
    instance: Type.Optional(Type.String()),
    requestId: Type.Optional(Type.String()),
    currentRevisionId: Type.String({ format: "uuid" }),
    currentRevisionNumber: Type.Integer({ minimum: 1 }),
    currentEtag: Type.String({
      pattern:
        '^"rev:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"$'
    })
  },
  { additionalProperties: true }
);

export const AppearanceSettingsSchema = Type.Object(
  {
    theme: Type.Union([Type.Literal("light"), Type.Literal("system")]),
    font: Type.Union([Type.Literal("noto-sans"), Type.Literal("system")]),
    glassIntensity: Type.Union([
      Type.Literal("subtle"),
      Type.Literal("balanced"),
      Type.Literal("strong")
    ]),
    accent: Type.Union([Type.Literal("blue"), Type.Literal("lilac"), Type.Literal("rose")]),
    backgroundMode: Type.Union([Type.Literal("fixed"), Type.Literal("rotate")])
  },
  { additionalProperties: false }
);
