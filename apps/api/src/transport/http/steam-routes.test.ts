// @vitest-environment node
import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferredRoutes } from "./routes";
import { registerProblemHandlers } from "./problem-details";

const apiKey = "a".repeat(32);
const steamId = "76561198000000001";
const owner = { actorId: "00000000-0000-4000-8000-000000000001" };
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(authenticated = true) {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  apps.push(app);
  registerProblemHandlers(app);
  app.addHook("preHandler", async (request) => {
    if (authenticated) request.nivalisOwner = owner;
  });
  const connection = {
    configured: true,
    enabled: true,
    credentialStatus: "pending_validation",
    credentialUpdatedAt: new Date(),
    lastValidatedAt: null,
    displayName: null,
    provider: "steam",
    providerAccountId: null
  };
  const connectSteam = vi.fn(async () => ({
    connection,
    validationJob: {
      id: "00000000-0000-4000-8000-000000000002",
      attemptCount: 0,
      finishedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      provider: "steam",
      requestedAt: new Date(),
      startedAt: null,
      status: "queued"
    }
  }));
  const disconnectSteam = vi.fn(async () => {});
  await app.register(deferredRoutes, {
    providerConnectionService: {
      connectSteam,
      disconnectSteam,
      getSteam: async () => connection
    }
  } as unknown as Parameters<typeof deferredRoutes>[1]);
  return { app, connectSteam, disconnectSteam };
}

describe("Steam HTTP boundary", () => {
  it.each([
    { steamId: Number(steamId), apiKey },
    { steamId: [steamId], apiKey },
    { steamId, apiKey: 123 },
    { steamId, apiKey, endpoint: "https://example.invalid" },
    { steamId, apiKey: "invalid" }
  ])("rejects malformed credentials before coercion or persistence %#", async (payload) => {
    const { app, connectSteam } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/providers/steam/connect",
      payload
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(apiKey);
    expect(connectSteam).not.toHaveBeenCalled();
  });

  it("keeps the exact string ID and returns only connection/job metadata", async () => {
    const { app, connectSteam, disconnectSteam } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/providers/steam/connect",
      payload: { steamId, apiKey }
    });
    expect(response.statusCode).toBe(202);
    expect(connectSteam).toHaveBeenCalledWith(owner, steamId, apiKey);
    expect(response.json()).toMatchObject({
      connection: { provider: "steam", credentialStatus: "pending_validation" },
      validationJob: { provider: "steam", status: "queued" }
    });
    expect(response.headers.location).toBe(
      `/v1/me/sync-jobs/${response.json().validationJob.jobId}`
    );
    expect(response.body).not.toContain(apiKey);
    expect((await app.inject("/v1/me/providers/steam")).statusCode).toBe(200);
    expect(
      (await app.inject({ method: "DELETE", url: "/v1/me/providers/steam/connection" })).statusCode
    ).toBe(204);
    expect(disconnectSteam).toHaveBeenCalledWith(owner);
  });

  it("never connects without an Owner context", async () => {
    const { app, connectSteam } = await setup(false);
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/providers/steam/connect",
      payload: { steamId, apiKey }
    });
    expect(response.statusCode).toBe(403);
    expect(connectSteam).not.toHaveBeenCalled();
  });
});
