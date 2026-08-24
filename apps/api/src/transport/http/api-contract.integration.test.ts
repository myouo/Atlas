import { randomUUID } from "node:crypto";
import path from "node:path";

import $RefParser from "@apidevtools/json-schema-ref-parser";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { parse } from "yaml";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "../../bootstrap/build-api";
import { loadApiConfig } from "../../config/api-config";
import { createMigrator } from "../../infrastructure/database/migrator";
import {
  PHASE_FIVE_NETEASE_CONNECTION_ID,
  PHASE_THREE_INITIAL_REVISION_ID,
  PHASE_TWO_OWNER_ID
} from "../../infrastructure/database/phase-two-fixture";
import { seedPhaseFiveFixture } from "../../infrastructure/database/seed";
import { createTestDatabase } from "../../testing/test-database";

interface DereferencedOpenApi {
  readonly paths: Record<
    string,
    Record<
      string,
      {
        readonly responses: Record<
          string,
          { readonly content?: Record<string, { readonly schema: object }> }
        >;
      }
    >
  >;
}

interface DashboardContractBody {
  readonly layout: {
    readonly lg: readonly LayoutContractItem[];
    readonly md: readonly LayoutContractItem[];
    readonly sm: readonly LayoutContractItem[];
  };
  readonly revision: number;
  readonly revisionId: string;
  readonly widgets: readonly WidgetContractBody[];
}

interface LayoutContractItem {
  readonly h: number;
  readonly i: string;
  readonly w: number;
  readonly x: number;
  readonly y: number;
}

interface WidgetContractBody extends Record<string, unknown> {
  readonly type: string;
}

const database = createTestDatabase();
const config = loadApiConfig({
  CORS_ORIGINS: "http://127.0.0.1:4174",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
  NIVALIS_OWNER_ID: PHASE_TWO_OWNER_ID,
  NODE_ENV: "test"
});
let app: FastifyInstance;
let openapi: DereferencedOpenApi;
let ownerCookie: string;
const ajv = addFormats(new Ajv2020({ allErrors: true, strict: false }));

beforeAll(async () => {
  const migration = await createMigrator(database).migrateToLatest();
  if (migration.error) throw migration.error;
  const source = parse(await readFile(path.resolve("openapi/nivalis.openapi.yaml"), "utf8"));
  openapi = (await $RefParser.dereference(source)) as DereferencedOpenApi;
  app = buildApi({ config, database, logger: false });
  await app.ready();
  ownerCookie = await fixtureSession("fixture-owner");
});

beforeEach(() => seedPhaseFiveFixture(database));

afterAll(async () => {
  if (app) await app.close();
  await database.destroy();
});

describe("Fastify immutable revision and OpenAPI contract", () => {
  it("enforces one Owner authorization boundary with 401, 403, session, and logout", async () => {
    const unauthenticated = await app.inject({ method: "GET", url: "/v1/me/providers" });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers["content-type"]).toContain("application/problem+json");

    const viewerCookie = await fixtureSession("fixture-viewer");
    const forbidden = await app.inject({
      headers: { cookie: viewerCookie },
      method: "GET",
      url: "/v1/me/providers"
    });
    expect(forbidden.statusCode).toBe(403);

    const csrfRejected = await app.inject({
      headers: { cookie: ownerCookie },
      method: "POST",
      url: "/v1/me/providers/fixture/sync"
    });
    expect(csrfRejected.statusCode).toBe(403);
    expect((await inject({ method: "GET", url: "/v1/me/providers" })).statusCode).toBe(200);

    const session = await app.inject({
      headers: { cookie: ownerCookie },
      method: "GET",
      url: "/v1/auth/session"
    });
    expect(session.json()).toMatchObject({ authenticated: true, role: "owner" });
    assertContract("/v1/auth/session", "get", 200, session);

    const restarted = buildApi({ config, database, logger: false });
    await restarted.ready();
    const afterRestart = await restarted.inject({
      headers: { cookie: ownerCookie },
      method: "GET",
      url: "/v1/auth/session"
    });
    expect(afterRestart.json()).toMatchObject({ authenticated: true, role: "owner" });
    await restarted.close();

    const disposableOwnerCookie = await fixtureSession("fixture-owner");
    const logout = await app.inject({
      headers: { cookie: disposableOwnerCookie, origin: config.appPublicOrigin },
      method: "POST",
      url: "/v1/auth/logout"
    });
    expect(logout.statusCode).toBe(204);
    const revoked = await app.inject({
      headers: { cookie: disposableOwnerCookie },
      method: "GET",
      url: "/v1/me/providers"
    });
    expect(revoked.statusCode).toBe(401);
  });

  it("stores NetEase credentials as write-only AEAD ciphertext and supports disconnect", async () => {
    const credential = "phase-five-integration-cookie-value";
    const accepted = await inject({
      method: "POST",
      payload: { credential, credentialType: "music_u" },
      url: "/v1/me/providers/netease/connect"
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({
      connection: {
        configured: true,
        credentialStatus: "pending_validation",
        enabled: true,
        provider: "netease"
      },
      validationJob: { provider: "netease", status: "queued" }
    });
    expect(accepted.body).not.toContain(credential);
    assertContract("/v1/me/providers/netease/connect", "post", 202, accepted);

    const stored = await database
      .selectFrom("provider_credentials")
      .select(["ciphertext", "nonce", "auth_tag", "key_id"])
      .executeTakeFirstOrThrow();
    expect(Buffer.from(stored.ciphertext).toString("utf8")).not.toContain(credential);
    expect(stored.nonce).toHaveLength(12);
    expect(stored.auth_tag).toHaveLength(16);
    expect(stored.key_id).toBe("primary");

    const connection = await inject({ method: "GET", url: "/v1/me/providers/netease" });
    expect(connection.statusCode).toBe(200);
    expect(connection.body).not.toContain(credential);
    expect(connection.json()).not.toHaveProperty("credential");
    assertContract("/v1/me/providers/netease", "get", 200, connection);

    const disconnected = await inject({
      method: "DELETE",
      url: "/v1/me/providers/netease/connection"
    });
    expect(disconnected.statusCode).toBe(204);
    const remaining = await database
      .selectFrom("provider_credentials")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(remaining.count)).toBe(0);
  });

  it("serves the Owner-only sanitized NetEase data catalog with a strong catalog ETag", async () => {
    const dataVersion = "00000000-0000-4000-8000-000000000998";
    await database
      .insertInto("provider_data_catalogs")
      .values({
        data: JSON.stringify({
          account: {
            avatarFrameUrl: null,
            avatarUrl: null,
            createdAt: null,
            displayName: "Contract Fixture",
            eventCount: 0,
            followerCount: 0,
            followingCount: 0,
            level: 1,
            playlistCount: 0,
            providerUserId: "fixture-user",
            signature: null,
            vipType: 0
          },
          allTimeRanking: [],
          createdPlaylists: { complete: true, items: [], providerTotal: 0 },
          followers: { complete: true, items: [], providerTotal: 0 },
          following: { complete: true, items: [], providerTotal: 0 },
          levelProgress: {
            currentLoginCount: null,
            currentPlayCount: null,
            nextLoginCount: null,
            nextPlayCount: null,
            progress: null
          },
          listening: {
            totalDurationSeconds: 0,
            totalListenCount: 0,
            weeklyDurationMinutes: 0,
            weeklyTrend: []
          },
          medals: { items: [], obtainedCount: 0 },
          memberships: [],
          musicCards: { items: [], sourceAvailability: "provider_omitted" },
          provider: "netease",
          recentListening: [],
          redVipAnnualCount: null,
          redVipLevel: null,
          schemaVersion: 1,
          socialStatus: null,
          weeklyRanking: []
        }),
        data_version_id: dataVersion,
        generated_at: new Date("2026-08-24T00:00:00.000Z"),
        provider: "netease",
        provider_connection_id: PHASE_FIVE_NETEASE_CONNECTION_ID,
        schema_version: 1
      })
      .execute();

    const response = await inject({ method: "GET", url: "/v1/me/providers/netease/data" });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe(`"catalog:${dataVersion}"`);
    expect(response.body).not.toMatch(/MUSIC_U|authorization|lastLoginIP/i);
    assertContract("/v1/me/providers/netease/data", "get", 200, response);
  });

  it("creates a secret-free, deduplicated QR AuthAttempt resource", async () => {
    const started = await inject({
      method: "POST",
      url: "/v1/me/providers/netease/auth-attempts/qr"
    });
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({
      method: "qr",
      provider: "netease",
      qrUrl: null,
      status: "queued"
    });
    expect(started.body).not.toMatch(/cookie|MUSIC_U/i);
    assertContract("/v1/me/providers/netease/auth-attempts/qr", "post", 202, started);

    const duplicate = await inject({
      method: "POST",
      url: "/v1/me/providers/netease/auth-attempts/qr"
    });
    expect(duplicate.json().attemptId).toBe(started.json().attemptId);
    const read = await inject({
      method: "GET",
      url: `/v1/me/providers/netease/auth-attempts/${started.json().attemptId}`
    });
    expect(read.statusCode).toBe(200);
    assertContract("/v1/me/providers/netease/auth-attempts/{attemptId}", "get", 200, read);
    const blockedManual = await inject({
      method: "POST",
      payload: {
        credential: "manual-cookie-cannot-race-active-attempt",
        credentialType: "music_u"
      },
      url: "/v1/me/providers/netease/connect"
    });
    expect(blockedManual.statusCode).toBe(409);
    const cancelled = await inject({
      method: "DELETE",
      url: `/v1/me/providers/netease/auth-attempts/${started.json().attemptId}`
    });
    expect(cancelled.statusCode).toBe(204);
    const terminal = await database
      .selectFrom("provider_auth_attempts")
      .select(["status", "secret_ciphertext"])
      .where("id", "=", started.json().attemptId)
      .executeTakeFirstOrThrow();
    expect(terminal).toEqual({ secret_ciphertext: null, status: "failed" });
  });

  it("encrypts SMS phone/code attempt state and never echoes either input", async () => {
    const phone = "13800138000";
    const started = await inject({
      method: "POST",
      payload: { countryCode: "86", phone },
      url: "/v1/me/providers/netease/auth-attempts/sms"
    });
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({
      maskedPhone: "+86 138****8000",
      method: "sms_otp",
      status: "queued"
    });
    expect(started.body).not.toContain(phone);
    assertContract("/v1/me/providers/netease/auth-attempts/sms", "post", 202, started);
    const attemptId = started.json().attemptId as string;
    const encryptedPhone = await database
      .selectFrom("provider_auth_attempts")
      .select("secret_ciphertext")
      .where("id", "=", attemptId)
      .executeTakeFirstOrThrow();
    expect(Buffer.from(encryptedPhone.secret_ciphertext!).toString("utf8")).not.toContain(phone);

    await database
      .updateTable("provider_auth_attempts")
      .set({ operation: "sms_verify", status: "waiting_for_code" })
      .where("id", "=", attemptId)
      .execute();
    const code = "123456";
    const verified = await inject({
      method: "POST",
      payload: { code },
      url: `/v1/me/providers/netease/auth-attempts/${attemptId}/verify`
    });
    expect(verified.statusCode).toBe(202);
    expect(verified.json().status).toBe("queued");
    expect(verified.body).not.toContain(code);
    assertContract(
      "/v1/me/providers/netease/auth-attempts/{attemptId}/verify",
      "post",
      202,
      verified
    );
    const encryptedCode = await database
      .selectFrom("provider_auth_attempts")
      .select("secret_ciphertext")
      .where("id", "=", attemptId)
      .executeTakeFirstOrThrow();
    expect(Buffer.from(encryptedCode.secret_ciphertext!).toString("utf8")).not.toContain(code);
  });

  it("disconnects credential and invalidates every active login attempt lifecycle", async () => {
    const connected = await inject({
      method: "POST",
      payload: {
        credential: "lifecycle-regression-manual-cookie",
        credentialType: "music_u"
      },
      url: "/v1/me/providers/netease/connect"
    });
    expect(connected.statusCode).toBe(202);
    const firstAttempt = await inject({
      method: "POST",
      url: "/v1/me/providers/netease/auth-attempts/qr"
    });
    expect(firstAttempt.statusCode).toBe(202);

    const disconnected = await inject({
      method: "DELETE",
      url: "/v1/me/providers/netease/connection"
    });
    expect(disconnected.statusCode).toBe(204);
    const invalidated = await database
      .selectFrom("provider_auth_attempts")
      .select(["status", "secret_ciphertext", "last_error_code"])
      .where("id", "=", firstAttempt.json().attemptId)
      .executeTakeFirstOrThrow();
    expect(invalidated).toEqual({
      last_error_code: "provider-auth-disconnected",
      secret_ciphertext: null,
      status: "failed"
    });
    const connection = await inject({ method: "GET", url: "/v1/me/providers/netease" });
    expect(connection.json()).toMatchObject({
      configured: false,
      credentialStatus: "not_configured",
      enabled: false
    });

    const secondAttempt = await inject({
      method: "POST",
      url: "/v1/me/providers/netease/auth-attempts/qr"
    });
    expect(secondAttempt.statusCode).toBe(202);
    expect(secondAttempt.json().attemptId).not.toBe(firstAttempt.json().attemptId);
  });

  it("serves health and database readiness with request IDs", async () => {
    const health = await inject({ method: "GET", url: "/health" });
    const ready = await inject({ method: "GET", url: "/ready" });
    expect(health.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(health.headers["x-request-id"]).toBeTruthy();
    assertContract("/health", "get", 200, health);
    assertContract("/ready", "get", 200, ready);
  });

  it("returns the Published aggregate Read Model with a strong view ETag", async () => {
    const response = await inject({ method: "GET", url: "/v1/public/dashboards/about" });
    expect(response.statusCode).toBe(200);
    expect(response.json().widgets).toHaveLength(10);
    expect(response.headers.etag).toMatch(/^"view:[0-9a-f]{64}"$/);
    assertContract("/v1/public/dashboards/about", "get", 200, response);
  });

  it("keeps Draft configuration immutable while serving live data separately", async () => {
    const draft = await getDraft();
    expect(draft.json().widgets[0]).not.toHaveProperty("data");
    const data = await inject({ method: "GET", url: "/v1/me/dashboards/about/data" });
    expect(data.statusCode).toBe(200);
    expect(data.headers.etag).toMatch(/^"data:[0-9a-f]{64}"$/);
    expect(data.json().configurationRevisionId).toBe(draft.json().revisionId);
    expect(data.json().widgets[0]).toHaveProperty("data");
    assertContract("/v1/me/dashboards/about/data", "get", 200, data);
  });

  it("requires If-Match for every Draft mutation", async () => {
    const draft = await getDraft();
    const widgetId = draft.json().widgets[0].id;
    const responses = await Promise.all([
      inject({
        method: "PUT",
        payload: draft.json(),
        url: "/v1/me/dashboards/about/draft"
      }),
      inject({ method: "POST", url: "/v1/me/dashboards/about/publish" }),
      inject({
        method: "POST",
        payload: createWidgetPayload(draft.json()),
        url: "/v1/me/dashboards/about/widgets"
      }),
      inject({
        method: "POST",
        url: `/v1/me/dashboards/about/revisions/${PHASE_THREE_INITIAL_REVISION_ID}/restore`
      }),
      inject({
        headers: { "content-type": "application/merge-patch+json" },
        method: "PATCH",
        payload: JSON.stringify({ title: "Missing precondition" }),
        url: `/v1/me/widgets/${widgetId}`
      }),
      inject({
        method: "DELETE",
        url: `/v1/me/widgets/${widgetId}`
      })
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(428);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(response.json()).toMatchObject({
        status: 428,
        type: "urn:nivalis:problem:precondition-required"
      });
    }
    assertContract("/v1/me/dashboards/about/draft", "put", 428, responses[0]!);
  });

  it("returns a new ETag after save and rejects the stale ETag with 412", async () => {
    const initial = await getDraft();
    const etagA = requiredEtag(initial);
    const draftA = initial.json();
    const saved = await saveDraft(draftA, etagA, 1);
    const etagB = requiredEtag(saved);

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ revision: 2, state: "draft" });
    expect(etagB).not.toBe(etagA);
    assertContract("/v1/me/dashboards/about/draft", "put", 200, saved);

    const stale = await saveDraft(draftA, etagA, 2);
    expect(stale.statusCode).toBe(412);
    expect(stale.json()).toMatchObject({
      currentEtag: etagB,
      currentRevisionNumber: 2,
      status: 412,
      type: "urn:nivalis:problem:revision-conflict"
    });
    assertContract("/v1/me/dashboards/about/draft", "put", 412, stale);
    expect(
      (await inject({ method: "GET", url: "/v1/public/dashboards/about" })).json().revision
    ).toBe(1);
  });

  it("rejects stale Publish and publishes no revision content of its own", async () => {
    const initial = await getDraft();
    const etagA = requiredEtag(initial);
    const saved = await saveDraft(initial.json(), etagA, 1);
    const etagB = requiredEtag(saved);

    const stalePublish = await inject({
      headers: { "if-match": etagA },
      method: "POST",
      url: "/v1/me/dashboards/about/publish"
    });
    expect(stalePublish.statusCode).toBe(412);
    expect(
      (await inject({ method: "GET", url: "/v1/public/dashboards/about" })).json().revision
    ).toBe(1);

    const published = await inject({
      headers: { "if-match": etagB },
      method: "POST",
      url: "/v1/me/dashboards/about/publish"
    });
    expect(published.statusCode).toBe(200);
    expect(requiredEtag(published)).toBe(etagB);
    expect(published.json()).toMatchObject({ revision: 2, state: "published" });
    const history = await inject({
      method: "GET",
      url: "/v1/me/dashboards/about/revisions"
    });
    expect(history.json().items).toHaveLength(2);
  });

  it("creates, patches, and deletes Widgets as separate revisions", async () => {
    const initial = await getDraft();
    const widgetId = randomUUID();
    const created = await inject({
      headers: { "if-match": requiredEtag(initial) },
      method: "POST",
      payload: createWidgetPayload(initial.json(), widgetId),
      url: "/v1/me/dashboards/about/widgets"
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers.location).toBe(`/v1/me/widgets/${widgetId}`);
    const createdEtag = requiredEtag(created);
    assertContract("/v1/me/dashboards/about/widgets", "post", 201, created);

    const patched = await inject({
      headers: {
        "content-type": "application/merge-patch+json",
        "if-match": createdEtag
      },
      method: "PATCH",
      payload: JSON.stringify({ enabled: false, title: "Updated Contract Fixture" }),
      url: `/v1/me/widgets/${widgetId}`
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ enabled: false, title: "Updated Contract Fixture" });
    const patchedEtag = requiredEtag(patched);
    expect(patchedEtag).not.toBe(createdEtag);
    assertContract("/v1/me/widgets/{widgetId}", "patch", 200, patched);

    const deleted = await inject({
      headers: { "if-match": patchedEtag },
      method: "DELETE",
      url: `/v1/me/widgets/${widgetId}`
    });
    expect(deleted.statusCode).toBe(204);
    expect(requiredEtag(deleted)).not.toBe(patchedEtag);
    const history = await inject({
      method: "GET",
      url: "/v1/me/dashboards/about/revisions"
    });
    expect(history.json().items.map(revisionNumber)).toEqual([4, 3, 2, 1]);
  });

  it("lists, reads, and restores history without auto-publishing", async () => {
    const initial = await getDraft();
    const revisionOneId = initial.json().revisionId;
    const second = await saveDraft(initial.json(), requiredEtag(initial), 1);
    const third = await saveDraft(second.json(), requiredEtag(second), 2);
    const etagC = requiredEtag(third);
    await inject({
      headers: { "if-match": etagC },
      method: "POST",
      url: "/v1/me/dashboards/about/publish"
    });

    const history = await inject({
      method: "GET",
      url: "/v1/me/dashboards/about/revisions?limit=2"
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().items.map(revisionNumber)).toEqual([3, 2]);
    expect(history.json().nextCursor).toBe("rev:2");
    assertContract("/v1/me/dashboards/about/revisions", "get", 200, history);

    const detail = await inject({
      method: "GET",
      url: `/v1/me/dashboards/about/revisions/${revisionOneId}`
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ revisionNumber: 1, restoredFromRevisionId: null });
    assertContract("/v1/me/dashboards/about/revisions/{revisionId}", "get", 200, detail);

    const staleRestore = await inject({
      headers: { "if-match": requiredEtag(initial) },
      method: "POST",
      url: `/v1/me/dashboards/about/revisions/${revisionOneId}/restore`
    });
    expect(staleRestore.statusCode).toBe(412);

    const restored = await inject({
      headers: { "if-match": etagC },
      method: "POST",
      url: `/v1/me/dashboards/about/revisions/${revisionOneId}/restore`
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ revision: 4, state: "draft" });
    expect(restored.json().layout).toEqual(initial.json().layout);
    const restoredDetail = await inject({
      method: "GET",
      url: `/v1/me/dashboards/about/revisions/${restored.json().revisionId}`
    });
    expect(restoredDetail.json()).toMatchObject({
      parentRevisionId: third.json().revisionId,
      restoredFromRevisionId: revisionOneId
    });
    const publicDashboard = await inject({
      method: "GET",
      url: "/v1/public/dashboards/about"
    });
    expect(publicDashboard.json()).toMatchObject({ revision: 3 });
  });

  it("returns RFC 9457 for malformed preconditions and input", async () => {
    const invalidEtag = await inject({
      headers: { "if-match": 'W/"rev:00000000-0000-4000-8000-000000000303"' },
      method: "POST",
      url: "/v1/me/dashboards/about/publish"
    });
    expect(invalidEtag.statusCode).toBe(400);
    expect(invalidEtag.json().type).toBe("urn:nivalis:problem:invalid-revision-etag");

    const invalidBody = await inject({
      headers: { "if-match": requiredEtag(await getDraft()) },
      method: "PUT",
      payload: { layout: {}, widgets: [] },
      url: "/v1/me/dashboards/about/draft"
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain("application/problem+json");
    assertContract("/v1/me/dashboards/about/draft", "put", 400, invalidBody);
  });

  it("creates a durable, deduplicated SyncRun and keeps unconfigured Providers explicit", async () => {
    const response = await inject({
      method: "POST",
      url: "/v1/me/providers/fixture/sync"
    });
    expect(response.statusCode).toBe(202);
    expect(response.headers.location).toBe(`/v1/me/sync-jobs/${response.json().jobId}`);
    expect(response.json()).toMatchObject({ provider: "fixture", status: "queued" });
    expect(response.json()).not.toHaveProperty("queueJobId");
    assertContract("/v1/me/providers/{provider}/sync", "post", 202, response);

    const duplicate = await inject({
      method: "POST",
      url: "/v1/me/providers/fixture/sync"
    });
    expect(duplicate.statusCode).toBe(202);
    expect(duplicate.json().jobId).toBe(response.json().jobId);

    const run = await inject({ method: "GET", url: response.headers.location! });
    expect(run.statusCode).toBe(200);
    expect(run.json().jobId).toBe(response.json().jobId);
    assertContract("/v1/me/sync-jobs/{jobId}", "get", 200, run);

    const unconfigured = await inject({
      method: "POST",
      url: "/v1/me/providers/github/sync"
    });
    expect(unconfigured.statusCode).toBe(409);
    expect(unconfigured.json().type).toBe("urn:nivalis:problem:provider-not-configured");
    assertContract("/v1/me/providers/{provider}/sync", "post", 409, unconfigured);
  });
});

async function getDraft() {
  const response = await inject({ method: "GET", url: "/v1/me/dashboards/about/draft" });
  expect(response.statusCode).toBe(200);
  expect(response.json().revisionId).toBeTruthy();
  expect(response.headers.etag).toBe(etag(response.json().revisionId));
  return response;
}

function saveDraft(draft: DashboardContractBody, ifMatch: string, x: number) {
  return inject({
    headers: { "if-match": ifMatch },
    method: "PUT",
    payload: {
      layout: {
        ...draft.layout,
        lg: draft.layout.lg.map((item, index) => (index === 0 ? { ...item, x } : item))
      },
      widgets: draft.widgets
    },
    url: "/v1/me/dashboards/about/draft"
  });
}

function createWidgetPayload(draft: DashboardContractBody, widgetId = randomUUID()) {
  const fixture = draft.widgets.find((widget) => widget.type === "github.profile");
  if (!fixture) throw new Error("The Phase 5 Seed must include a GitHub fixture.");
  return {
    placement: {
      lg: { h: 3, i: widgetId, w: 4, x: 0, y: 100 },
      md: { h: 3, i: widgetId, w: 3, x: 0, y: 100 },
      sm: { h: 4, i: widgetId, w: 4, x: 0, y: 100 }
    },
    widget: { ...fixture, id: widgetId, title: "Contract Fixture" }
  };
}

function requiredEtag(response: LightMyRequestResponse) {
  const value = response.headers.etag;
  if (typeof value !== "string") throw new Error("Response did not include one ETag header.");
  expect(value).toMatch(/^"rev:[0-9a-f-]+"$/);
  return value;
}

function etag(revisionId: string) {
  return `"rev:${revisionId}"`;
}

function revisionNumber(revision: { readonly revisionNumber: number }) {
  return revision.revisionNumber;
}

function inject(options: InjectOptions | string) {
  if (typeof options === "string") return app.inject(options);
  const url = "url" in options ? String(options.url) : "";
  if (!url.startsWith("/v1/me/")) return app.inject(options);
  return app.inject({
    ...options,
    headers: {
      cookie: ownerCookie,
      origin: config.appPublicOrigin,
      ...(options.headers as Record<string, string> | undefined)
    }
  });
}

async function fixtureSession(code: "fixture-owner" | "fixture-viewer") {
  const started = await app.inject({ method: "POST", url: "/v1/auth/github/start" });
  expect(started.statusCode).toBe(200);
  const authorization = new URL(started.json().authorizationUrl as string);
  authorization.searchParams.set("code", code);
  const callback = await app.inject({
    method: "GET",
    url: `${authorization.pathname}${authorization.search}`
  });
  expect(callback.statusCode).toBe(302);
  const cookie = callback.headers["set-cookie"];
  if (typeof cookie !== "string") throw new Error("OAuth callback omitted the Session cookie.");
  return cookie.split(";", 1)[0]!;
}

function assertContract(
  route: string,
  method: string,
  status: number,
  response: LightMyRequestResponse
) {
  const mediaType = response.headers["content-type"]?.split(";")[0] ?? "application/json";
  const operation = openapi.paths[route]?.[method];
  const documented = operation?.responses[String(status)] ?? operation?.responses.default;
  const schema = documented?.content?.[mediaType]?.schema;
  expect(schema, `${method.toUpperCase()} ${route} ${status} has a contract schema`).toBeDefined();
  const validate = ajv.compile(schema!);
  expect(validate(response.json()), JSON.stringify(validate.errors)).toBe(true);
}
