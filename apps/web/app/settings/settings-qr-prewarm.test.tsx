import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getNeteaseAuthAttempt, startNeteaseQrAuth } = vi.hoisted(() => ({
  getNeteaseAuthAttempt: vi.fn(),
  startNeteaseQrAuth: vi.fn()
}));

vi.mock("../../api/dashboard-source-factory", () => ({
  dashboardSource: {
    getAuthSession: async () => ({
      actorId: "00000000-0000-4000-8000-000000000001",
      authenticated: true,
      expiresAt: "2026-08-25T12:00:00.000Z",
      role: "owner"
    }),
    getNeteaseAuthAttempt,
    getNeteaseConnection: async () => ({
      configured: false,
      credentialStatus: "not_configured",
      credentialUpdatedAt: null,
      displayName: null,
      enabled: false,
      lastValidatedAt: null,
      provider: "netease",
      providerAccountId: null
    }),
    kind: "api",
    startNeteaseQrAuth
  }
}));

import SettingsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings NetEase QR prewarm", () => {
  it("starts QR preparation within one second of the default panel becoming eligible", async () => {
    startNeteaseQrAuth.mockResolvedValue(authAttempt("queued"));
    getNeteaseAuthAttempt.mockResolvedValue(authAttempt("failed"));
    render(<SettingsPage />);

    await waitFor(() => expect(startNeteaseQrAuth).toHaveBeenCalledOnce(), { timeout: 900 });
  });
});

function authAttempt(status: "failed" | "queued") {
  return {
    attemptId: "00000000-0000-4000-8000-000000000702",
    createdAt: "2026-08-25T00:00:00.000Z",
    expiresAt: "2026-08-25T00:03:00.000Z",
    lastErrorCode: status === "failed" ? "provider-auth-cancelled" : null,
    lastErrorMessage: status === "failed" ? "The attempt ended." : null,
    maskedPhone: null,
    method: "qr" as const,
    provider: "netease" as const,
    qrUrl: null,
    resendAfter: null,
    status,
    updatedAt: "2026-08-25T00:00:00.000Z"
  };
}
