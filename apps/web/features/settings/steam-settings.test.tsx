import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderConnection, SyncJob } from "@nivalis/api-client";
import { SteamSettings } from "./steam-settings";

const source = vi.hoisted(() => ({
  kind: "api",
  getSteamConnection: vi.fn(),
  connectSteam: vi.fn(),
  disconnectSteam: vi.fn(),
  enqueueProviderSync: vi.fn(),
  getSyncJob: vi.fn()
}));
vi.mock("../../api/dashboard-source-factory", () => ({ dashboardSource: source }));
const connection: ProviderConnection = {
  provider: "steam",
  configured: false,
  enabled: false,
  credentialStatus: "not_configured",
  credentialUpdatedAt: null,
  displayName: null,
  lastValidatedAt: null,
  providerAccountId: null
};
const job: SyncJob = {
  provider: "steam",
  jobId: "00000000-0000-4000-8000-000000000004",
  attemptCount: 0,
  finishedAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  requestedAt: "2026-09-06T00:00:00.000Z",
  startedAt: null,
  status: "queued"
};
const clients: QueryClient[] = [];
function mount(owner = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <SteamSettings owner={owner} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  source.kind = "api";
  source.getSteamConnection.mockResolvedValue(connection);
  source.getSyncJob.mockResolvedValue(job);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("Steam settings", () => {
  it("disables credentials in mock mode and for visitors", () => {
    source.kind = "mock";
    const view = mount();
    expect(screen.getByText(/本地示例模式/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Steam Web API Key")).not.toBeInTheDocument();
    view.unmount();
    source.kind = "api";
    mount(false);
    expect(screen.getByText(/Owner 身份登录/)).toBeInTheDocument();
    expect(source.getSteamConnection).not.toHaveBeenCalled();
  });
  it("submits an exact SteamID string and clears the password after saving", async () => {
    source.connectSteam.mockResolvedValue({ connection, validationJob: job });
    mount();
    const save = screen.getByRole("button", { name: "连接并验证 Steam" });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.type(screen.getByLabelText("SteamID64"), "76561198000000001");
    const keyInput = screen.getByLabelText("Steam Web API Key");
    expect(keyInput).toHaveAttribute("type", "password");
    await userEvent.type(keyInput, "a".repeat(32));
    await userEvent.click(save);
    await waitFor(() =>
      expect(source.connectSteam).toHaveBeenCalledWith("76561198000000001", "a".repeat(32))
    );
    await waitFor(() => expect(keyInput).toHaveValue(""));
    expect(save).toBeDisabled();
    expect(localStorage.getItem("steam_web_api")).toBeNull();
  });
  it("allows retrying connection reads and reports a failed sync without clearing data", async () => {
    source.getSteamConnection.mockRejectedValueOnce(new Error("offline"));
    source.getSteamConnection.mockResolvedValue({
      ...connection,
      configured: true,
      enabled: true,
      credentialStatus: "valid"
    });
    source.enqueueProviderSync.mockResolvedValue(job);
    source.getSyncJob.mockResolvedValue({ ...job, status: "failed" });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "重新读取" }));
    await userEvent.click(await screen.findByRole("button", { name: "同步 Steam" }));
    expect(source.enqueueProviderSync).toHaveBeenCalledWith("steam");
    await screen.findByText(/同步失败，之前成功的数据已保留/);
  });
});
