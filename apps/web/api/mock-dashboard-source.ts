import type {
  DashboardRevisionDetail,
  DashboardRevisionMetadata,
  Provider,
  ProviderConnection,
  ProviderStatus
} from "@nivalis/api-client";

import type {
  DashboardDataSource,
  DashboardEditableDraft,
  HydratedDashboardState,
  VersionedDashboardState
} from "./dashboard-source";
import { mockDashboard } from "../features/dashboard/mock-dashboard";

const initialRevisionId = "00000000-0000-4000-8000-000000000401";
const initialConcurrencyToken = `mock:rev:${initialRevisionId}`;

const mockNeteaseConnection: ProviderConnection = {
  configured: false,
  credentialStatus: "not_configured" as const,
  credentialUpdatedAt: null,
  displayName: null,
  enabled: false,
  lastValidatedAt: null,
  provider: "netease" as const,
  providerAccountId: null
};

const mockProviderStatuses: readonly ProviderStatus[] = [
  "netease",
  "github",
  "bangumi",
  "steam",
  "bilibili"
].map((provider) => ({
  attemptCount: 0,
  connection: "fixture",
  credentialStatus: "valid",
  lastAttemptAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  lastSuccessAt: null,
  provider: provider as ProviderStatus["provider"],
  syncStatus: "idle"
}));

function cloneDashboard() {
  return structuredClone(mockDashboard);
}

function toState(
  input: DashboardEditableDraft,
  state: HydratedDashboardState["state"],
  revision = mockDashboard.revision + 1
): HydratedDashboardState {
  return {
    dashboardId: "about",
    layout: structuredClone(input.layout),
    profile: structuredClone(mockDashboard.profile),
    revision,
    revisionId: mockRevisionId(revision),
    state,
    updatedAt: new Date().toISOString(),
    widgets: structuredClone(input.widgets)
  };
}

function versioned(dashboard: HydratedDashboardState): VersionedDashboardState {
  return { concurrencyToken: `mock:rev:${dashboard.revisionId}`, dashboard };
}

const initialMetadata: DashboardRevisionMetadata = {
  createdAt: "2026-08-23T04:30:00.000Z",
  isCurrentDraft: true,
  isCurrentPublished: true,
  operation: "seed",
  parentRevisionId: null,
  restoredFromRevisionId: null,
  revisionId: initialRevisionId,
  revisionNumber: mockDashboard.revision
};

const initialDetail: DashboardRevisionDetail = {
  ...initialMetadata,
  dashboardId: "about",
  layout: structuredClone(mockDashboard.layout),
  profile: structuredClone(mockDashboard.profile),
  widgets: mockDashboard.widgets.map(toConfiguration)
};

export const mockDashboardSource: DashboardDataSource = {
  kind: "mock",
  async getAuthSession() {
    await Promise.resolve();
    return {
      actorId: "00000000-0000-4000-8000-000000000001",
      authenticated: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      role: "owner"
    };
  },
  async logout() {
    await Promise.resolve();
  },
  async startAuthentication() {
    await Promise.resolve();
    return { authorizationUrl: "/" };
  },
  async getProviderConnections() {
    await Promise.resolve();
    return [structuredClone(mockNeteaseConnection)];
  },
  async getNeteaseConnection() {
    await Promise.resolve();
    return structuredClone(mockNeteaseConnection);
  },
  async getNeteaseDataCatalog() {
    return {
      catalog: {
        account: {
          avatarFrameUrl: null,
          avatarUrl: "/images/mock-avatar-profile.webp",
          createdAt: "2020-01-01T00:00:00.000Z",
          displayName: "Nivalis Fixture",
          eventCount: 18,
          followerCount: 128,
          followingCount: 36,
          level: 10,
          playlistCount: 8,
          providerUserId: "10001",
          signature: "Sanitized fixture profile",
          vipType: 11
        },
        allTimeRanking: [
          {
            playCount: 420,
            rank: 1,
            score: 100,
            track: {
              albumName: "Fixture Album",
              artists: [{ name: "Aimer", providerArtistId: "30001" }],
              coverUrl: "https://p1.music.126.net/sanitized-fixture/20001.jpg",
              durationMs: 240000,
              name: "Snow Light",
              providerTrackId: "20001"
            }
          }
        ],
        createdPlaylists: { complete: true, items: [], providerTotal: 0 },
        followers: { complete: true, items: [], providerTotal: 128 },
        following: { complete: true, items: [], providerTotal: 36 },
        levelProgress: {
          currentLoginCount: 2_300,
          currentPlayCount: 14_230,
          nextLoginCount: null,
          nextPlayCount: 20_000,
          progress: 71
        },
        listening: {
          totalDurationSeconds: 582420,
          totalListenCount: 6421,
          weeklyDurationMinutes: 91,
          weeklyTrend: []
        },
        medals: { items: [], obtainedCount: 0 },
        memberships: [],
        musicCards: { items: [], sourceAvailability: "provider_omitted" },
        provider: "netease",
        recentListening: [],
        redVipAnnualCount: 1,
        redVipLevel: 6,
        schemaVersion: 1,
        socialStatus: null,
        weeklyRanking: [
          {
            playCount: 12,
            rank: 1,
            score: 100,
            track: {
              albumName: "Fixture Album",
              artists: [{ name: "Aimer", providerArtistId: "30001" }],
              coverUrl: "https://p1.music.126.net/sanitized-fixture/20001.jpg",
              durationMs: 240000,
              name: "Snow Light",
              providerTrackId: "20001"
            }
          }
        ]
      },
      dataVersion: "00000000-0000-4000-8000-000000000901",
      generatedAt: "2026-08-24T00:00:00.000Z",
      provider: "netease" as const,
      schemaVersion: 1 as const
    };
  },
  async startNeteaseQrAuth() {
    throw mockProviderAuthUnavailable();
  },
  async cancelNeteaseAuthAttempt(attemptId) {
    void attemptId;
    throw mockProviderAuthUnavailable();
  },
  async startNeteaseSmsAuth(phone, countryCode) {
    void phone;
    void countryCode;
    throw mockProviderAuthUnavailable();
  },
  async getNeteaseAuthAttempt(attemptId) {
    void attemptId;
    throw mockProviderAuthUnavailable();
  },
  async verifyNeteaseSmsAuth(attemptId, code) {
    void attemptId;
    void code;
    throw mockProviderAuthUnavailable();
  },
  async connectNetease(credential) {
    void credential;
    throw mockProviderAuthUnavailable();
  },
  async disconnectNetease() {
    await Promise.resolve();
  },
  async enqueueProviderSync(provider: Provider) {
    await Promise.resolve();
    return mockSyncJob(provider, "queued");
  },
  async getSyncJob(jobId) {
    await Promise.resolve();
    return { ...mockSyncJob("fixture", "completed"), jobId };
  },
  async load() {
    await Promise.resolve();
    const published = cloneDashboard();
    return {
      draft: {
        concurrencyToken: initialConcurrencyToken,
        dashboard: {
          ...published,
          revisionId: initialRevisionId,
          state: "draft",
          updatedAt: "2026-08-23T04:30:00.000Z"
        }
      },
      providerStatuses: structuredClone(mockProviderStatuses),
      published,
      session: await this.getAuthSession()
    };
  },
  async saveDraft(input) {
    await Promise.resolve();
    return versioned(toState(input, "draft"));
  },
  async publishDraft(input) {
    await Promise.resolve();
    return versioned(toState(input, "published"));
  },
  async refreshProjections() {
    await Promise.resolve();
    const published = cloneDashboard();
    return {
      draftWidgets: structuredClone(published.widgets),
      providerStatuses: structuredClone(mockProviderStatuses),
      published
    };
  },
  async listRevisions() {
    await Promise.resolve();
    return { items: [structuredClone(initialMetadata)], nextCursor: null };
  },
  async getRevision(revisionId) {
    await Promise.resolve();
    if (revisionId !== initialRevisionId) throw new Error("Mock revision was not found.");
    return structuredClone(initialDetail);
  },
  async restoreRevision(revisionId) {
    const detail = await this.getRevision(revisionId);
    return versioned(
      toState(
        { layout: detail.layout, widgets: hydrateMockConfigurations(detail.widgets) },
        "draft",
        mockDashboard.revision + 1
      )
    );
  }
};

function mockRevisionId(revision: number) {
  return `00000000-0000-4000-8000-${String(revision).padStart(12, "0")}`;
}

function toConfiguration(widget: (typeof mockDashboard.widgets)[number]) {
  return {
    dataConfig: structuredClone(widget.dataConfig),
    enabled: widget.enabled,
    id: widget.id,
    presentationConfig: structuredClone(widget.presentationConfig),
    provider: widget.provider,
    schemaVersion: widget.schemaVersion,
    title: widget.title,
    type: widget.type
  };
}

function hydrateMockConfigurations(configurations: DashboardRevisionDetail["widgets"]) {
  return configurations.map((configuration) => {
    const projection = mockDashboard.widgets.find(
      (candidate) => candidate.id === configuration.id && candidate.type === configuration.type
    );
    if (!projection) throw new Error(`Mock projection '${configuration.id}' was not found.`);
    return { ...projection, ...configuration } as (typeof mockDashboard.widgets)[number];
  });
}

function mockSyncJob(provider: Provider, status: "queued" | "completed") {
  const now = new Date().toISOString();
  return {
    attemptCount: status === "completed" ? 1 : 0,
    finishedAt: status === "completed" ? now : null,
    jobId: "00000000-0000-4000-8000-000000009001",
    lastErrorCode: null,
    lastErrorMessage: null,
    provider,
    requestedAt: now,
    startedAt: status === "completed" ? now : null,
    status
  } as const;
}

function mockProviderAuthUnavailable() {
  return new Error(
    "Provider authentication is disabled in Mock Mode. Start API Mode with the independent Worker."
  );
}
