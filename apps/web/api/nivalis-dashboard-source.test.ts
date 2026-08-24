import type {
  DashboardRevisionDetail,
  DashboardState,
  WidgetConfiguration
} from "@nivalis/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockDashboard } from "../features/dashboard/mock-dashboard";
import { createDashboardDataSource } from "./dashboard-source-factory";
import { RevisionConflictError } from "./dashboard-source";
import { DashboardSourceError } from "./nivalis-dashboard-source";

const revisionOneId = "00000000-0000-4000-8000-000000000301";
const revisionTwoId = "00000000-0000-4000-8000-000000000302";
const etagOne = `"rev:${revisionOneId}"`;
const etagTwo = `"rev:${revisionTwoId}"`;
const configurationWidgets = mockDashboard.widgets.map(toConfiguration);

const draft: DashboardState = {
  ...mockDashboard,
  revisionId: revisionOneId,
  state: "draft",
  updatedAt: "2026-08-23T04:30:00.000Z",
  widgets: configurationWidgets
};

const revisionDetail: DashboardRevisionDetail = {
  createdAt: draft.updatedAt,
  dashboardId: "about",
  isCurrentDraft: true,
  isCurrentPublished: true,
  layout: draft.layout,
  operation: "seed",
  parentRevisionId: null,
  profile: draft.profile,
  restoredFromRevisionId: null,
  revisionId: revisionOneId,
  revisionNumber: 1,
  widgets: draft.widgets
};

afterEach(() => vi.unstubAllGlobals());

describe("DashboardDataSource composition", () => {
  it("keeps Mock mode available with a simple revision token", async () => {
    const source = createDashboardDataSource({ kind: "mock" });
    expect(source.kind).toBe("mock");
    const loaded = await source.load();
    expect(loaded.published.widgets).toHaveLength(10);
    expect(loaded.draft!.concurrencyToken).toContain("mock:rev:");
  });

  it("encapsulates ETag headers across load, save, publish, history, and restore", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === "/v1/auth/session") {
        return json(
          {
            actorId: "00000000-0000-4000-8000-000000000001",
            authenticated: true,
            expiresAt: "2099-01-01T00:00:00.000Z",
            role: "owner"
          },
          200,
          {}
        );
      }
      if (path === "/v1/public/dashboards/about") return json(mockDashboard, 200, {});
      if (path === "/v1/me/providers/status") return json({ providers: [] }, 200, {});
      if (path === "/v1/me/providers" && request.method === "GET") {
        return json({ providers: [neteaseConnection()] }, 200, {});
      }
      if (path === "/v1/me/providers/netease" && request.method === "GET") {
        return json(neteaseConnection(), 200, {});
      }
      if (path === "/v1/me/providers/netease/connect" && request.method === "POST") {
        return json(
          {
            connection: {
              ...neteaseConnection(),
              configured: true,
              enabled: true,
              credentialStatus: "pending_validation"
            },
            validationJob: syncJob("queued", "netease")
          },
          202,
          { location: "/v1/me/sync-jobs/00000000-0000-4000-8000-000000000900" }
        );
      }
      if (path === "/v1/me/providers/netease/connection" && request.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (path === "/v1/me/providers/netease/auth-attempts/qr" && request.method === "POST") {
        return json(authAttempt("qr", "waiting_for_scan"), 202, {
          location: "/v1/me/providers/netease/auth-attempts/00000000-0000-4000-8000-000000000901"
        });
      }
      if (path === "/v1/me/providers/netease/auth-attempts/sms" && request.method === "POST") {
        return json(authAttempt("sms_otp", "waiting_for_code"), 202, {});
      }
      if (
        path === "/v1/me/providers/netease/auth-attempts/00000000-0000-4000-8000-000000000901" &&
        request.method === "GET"
      ) {
        return json(authAttempt("qr", "waiting_for_confirmation"), 200, {});
      }
      if (
        path === "/v1/me/providers/netease/auth-attempts/00000000-0000-4000-8000-000000000901" &&
        request.method === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }
      if (
        path ===
          "/v1/me/providers/netease/auth-attempts/00000000-0000-4000-8000-000000000901/verify" &&
        request.method === "POST"
      ) {
        return json(authAttempt("sms_otp", "verifying"), 202, {});
      }
      if (path === "/v1/me/providers/fixture/sync" && request.method === "POST") {
        return json(syncJob("queued"), 202, {
          location: "/v1/me/sync-jobs/00000000-0000-4000-8000-000000000900"
        });
      }
      if (path === "/v1/me/sync-jobs/00000000-0000-4000-8000-000000000900") {
        return json(syncJob("completed"), 200, {});
      }
      if (path === "/v1/me/dashboards/about/data") {
        return json(
          {
            configurationRevisionId: revisionOneId,
            dashboardId: "about",
            generatedAt: draft.updatedAt,
            projectionVersions: [],
            widgets: mockDashboard.widgets
          },
          200,
          { etag: '"data:test"' }
        );
      }
      if (path === "/v1/me/dashboards/about/draft" && request.method === "GET") {
        return json(draft, 200, { etag: etagOne });
      }
      if (path === "/v1/me/dashboards/about/draft" && request.method === "PUT") {
        return json({ ...draft, revision: 2, revisionId: revisionTwoId }, 200, {
          etag: etagTwo
        });
      }
      if (path === "/v1/me/dashboards/about/publish") {
        return json({ ...draft, revision: 2, revisionId: revisionTwoId, state: "published" }, 200, {
          etag: etagTwo
        });
      }
      if (path === "/v1/me/dashboards/about/revisions") {
        return json(
          {
            items: [
              {
                createdAt: draft.updatedAt,
                isCurrentDraft: true,
                isCurrentPublished: true,
                operation: "seed",
                parentRevisionId: null,
                restoredFromRevisionId: null,
                revisionId: revisionOneId,
                revisionNumber: 1
              }
            ],
            nextCursor: null
          },
          200,
          {}
        );
      }
      if (path === `/v1/me/dashboards/about/revisions/${revisionOneId}`) {
        return json(revisionDetail, 200, { etag: etagOne });
      }
      if (path.endsWith(`/${revisionOneId}/restore`)) {
        return json({ ...draft, revision: 2, revisionId: revisionTwoId }, 200, {
          etag: etagTwo
        });
      }
      return json(
        { status: 404, title: "Not found", type: "urn:nivalis:problem:not-found" },
        404,
        {}
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const source = createDashboardDataSource({ apiBaseUrl: "http://api.test", kind: "api" });
    const loaded = await source.load();
    expect(loaded.draft).toMatchObject({ concurrencyToken: etagOne });
    const saved = await source.saveDraft(
      { layout: draft.layout, widgets: mockDashboard.widgets },
      loaded.draft!.concurrencyToken
    );
    expect(saved.concurrencyToken).toBe(etagTwo);
    const published = await source.publishDraft(
      { layout: draft.layout, widgets: mockDashboard.widgets },
      saved.concurrencyToken
    );
    expect(published.concurrencyToken).toBe(etagTwo);
    expect((await source.listRevisions()).items).toHaveLength(1);
    expect((await source.getRevision(revisionOneId)).revisionNumber).toBe(1);
    expect((await source.restoreRevision(revisionOneId, etagTwo)).concurrencyToken).toBe(etagTwo);
    const syncRun = await source.enqueueProviderSync("fixture");
    expect(syncRun).toMatchObject({ provider: "fixture", status: "queued" });
    expect(await source.getSyncJob(syncRun.jobId)).toMatchObject({ status: "completed" });
    expect((await source.refreshProjections()).draftWidgets).toHaveLength(10);
    expect(await source.getProviderConnections()).toHaveLength(1);
    expect(await source.getNeteaseConnection()).toMatchObject({ configured: false });
    const credential = "adapter-private-cookie-value";
    expect(await source.connectNetease(credential)).toMatchObject({
      connection: { credentialStatus: "pending_validation" },
      validationJob: { provider: "netease" }
    });
    await source.disconnectNetease();
    const qr = await source.startNeteaseQrAuth();
    expect(qr).toMatchObject({ method: "qr", status: "waiting_for_scan" });
    expect(await source.getNeteaseAuthAttempt(qr.attemptId)).toMatchObject({
      status: "waiting_for_confirmation"
    });
    await source.cancelNeteaseAuthAttempt(qr.attemptId);
    expect(await source.startNeteaseSmsAuth("13800138000", "86")).toMatchObject({
      method: "sms_otp"
    });
    expect(await source.verifyNeteaseSmsAuth(qr.attemptId, "123456")).toMatchObject({
      status: "verifying"
    });

    const requests = fetchMock.mock.calls.map(([input, init]) => {
      const request = input instanceof Request ? input : new Request(input, init);
      return {
        ifMatch: request.headers.get("if-match"),
        operation: `${request.method} ${new URL(request.url).pathname}`
      };
    });
    expect(requests).toEqual(
      expect.arrayContaining([
        { ifMatch: etagOne, operation: "PUT /v1/me/dashboards/about/draft" },
        { ifMatch: etagTwo, operation: "POST /v1/me/dashboards/about/publish" },
        {
          ifMatch: etagTwo,
          operation: `POST /v1/me/dashboards/about/revisions/${revisionOneId}/restore`
        }
      ])
    );
    const putRequest = fetchMock.mock.calls
      .map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
      .find(
        (request) =>
          request.method === "PUT" &&
          new URL(request.url).pathname === "/v1/me/dashboards/about/draft"
      );
    const savedBody = (await putRequest!.clone().json()) as { widgets: Record<string, unknown>[] };
    expect(savedBody.widgets[0]).not.toHaveProperty("data");
    expect(savedBody.widgets[0]).not.toHaveProperty("stale");
    expect(savedBody.widgets[0]).not.toHaveProperty("updatedAt");
    const connectRequest = fetchMock.mock.calls
      .map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
      .find(
        (request) =>
          request.method === "POST" &&
          new URL(request.url).pathname === "/v1/me/providers/netease/connect"
      );
    expect(await connectRequest!.clone().json()).toEqual({
      credential,
      credentialType: "music_u"
    });
  });

  it("maps HTTP 412 to a semantic RevisionConflictError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            currentEtag: etagTwo,
            currentRevisionId: revisionTwoId,
            currentRevisionNumber: 2,
            status: 412,
            title: "Dashboard revision conflict",
            type: "urn:nivalis:problem:revision-conflict"
          },
          412,
          {}
        )
      )
    );
    const source = createDashboardDataSource({ apiBaseUrl: "http://api.test", kind: "api" });
    await expect(
      source.saveDraft({ layout: draft.layout, widgets: mockDashboard.widgets }, etagOne)
    ).rejects.toMatchObject({
      currentConcurrencyToken: etagTwo,
      currentRevisionNumber: 2
    });
    await expect(
      source.saveDraft({ layout: draft.layout, widgets: mockDashboard.widgets }, etagOne)
    ).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it("surfaces other RFC 9457 failures through one adapter error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            detail: "Database unavailable",
            status: 503,
            title: "Unavailable",
            type: "urn:nivalis:problem:database-unavailable"
          },
          503,
          {}
        )
      )
    );
    const source = createDashboardDataSource({ apiBaseUrl: "http://api.test", kind: "api" });
    await expect(source.load()).rejects.toBeInstanceOf(DashboardSourceError);
  });
});

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
    status
  });
}

function toConfiguration(widget: (typeof mockDashboard.widgets)[number]): WidgetConfiguration {
  return {
    dataConfig: widget.dataConfig,
    enabled: widget.enabled,
    id: widget.id,
    presentationConfig: widget.presentationConfig,
    provider: widget.provider,
    schemaVersion: widget.schemaVersion,
    title: widget.title,
    type: widget.type
  };
}

function syncJob(status: "queued" | "completed", provider: "fixture" | "netease" = "fixture") {
  return {
    attemptCount: status === "completed" ? 1 : 0,
    finishedAt: status === "completed" ? draft.updatedAt : null,
    jobId: "00000000-0000-4000-8000-000000000900",
    lastErrorCode: null,
    lastErrorMessage: null,
    provider,
    requestedAt: draft.updatedAt,
    startedAt: status === "completed" ? draft.updatedAt : null,
    status
  };
}

function neteaseConnection() {
  return {
    configured: false,
    credentialStatus: "not_configured",
    credentialUpdatedAt: null,
    displayName: null,
    enabled: false,
    lastValidatedAt: null,
    provider: "netease",
    providerAccountId: null
  } as const;
}

function authAttempt(
  method: "qr" | "sms_otp",
  status: "verifying" | "waiting_for_confirmation" | "waiting_for_code" | "waiting_for_scan"
) {
  return {
    attemptId: "00000000-0000-4000-8000-000000000901",
    createdAt: draft.updatedAt,
    expiresAt: "2026-08-23T04:35:00.000Z",
    lastErrorCode: null,
    lastErrorMessage: null,
    maskedPhone: method === "sms_otp" ? "+86 138****8000" : null,
    method,
    provider: "netease",
    qrUrl: method === "qr" ? "https://music.163.com/login?codekey=fixture" : null,
    resendAfter: null,
    status,
    updatedAt: draft.updatedAt
  };
}
