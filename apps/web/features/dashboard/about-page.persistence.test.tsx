import type { DashboardDataSource } from "../../api/dashboard-source";
import { RevisionConflictError } from "../../api/dashboard-source";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockDashboard } from "./mock-dashboard";
import { AboutPage } from "./about-page";
import { useDashboardStore } from "./dashboard-store";

vi.mock("./dashboard-canvas", () => ({
  DashboardCanvas: ({ editable }: { readonly editable: boolean }) => (
    <div data-editable={String(editable)} data-testid="dashboard-canvas" />
  )
}));

const draft = {
  ...mockDashboard,
  revisionId: "00000000-0000-4000-8000-000000000301",
  state: "draft" as const,
  updatedAt: "2026-08-23T04:30:00.000Z"
};

const ownerSession = {
  actorId: "00000000-0000-4000-8000-000000000001",
  authenticated: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  role: "owner" as const
};

const anonymousSession = {
  actorId: null,
  authenticated: false,
  expiresAt: null,
  role: null
};

beforeEach(() => {
  localStorage.clear();
  useDashboardStore.setState({
    concurrencyToken: null,
    conflict: null,
    dirty: false,
    draft: null,
    initialized: false,
    lastPublishedAt: null,
    lastSavedAt: null,
    manualOverrides: { lg: false, md: false, sm: false },
    mode: "display",
    published: null,
    sourceKind: null
  });
});

afterEach(cleanup);

describe("API persistence failure UX", () => {
  it("keeps the public homepage content-only until an Owner session exists", async () => {
    const unsupported = async () => {
      throw new Error("Owner capability is unavailable.");
    };
    const publicSource: DashboardDataSource = {
      cancelNeteaseAuthAttempt: unsupported,
      connectNetease: unsupported,
      disconnectNetease: unsupported,
      enqueueProviderSync: unsupported,
      getAuthSession: async () => anonymousSession,
      getNeteaseAuthAttempt: unsupported,
      getNeteaseConnection: unsupported,
      getProviderConnections: unsupported,
      getRevision: unsupported,
      getSyncJob: unsupported,
      kind: "api",
      listRevisions: unsupported,
      load: async () => ({
        draft: null,
        providerStatuses: [],
        published: mockDashboard,
        session: anonymousSession
      }),
      logout: unsupported,
      publishDraft: unsupported,
      refreshProjections: unsupported,
      restoreRevision: unsupported,
      saveDraft: unsupported,
      startAuthentication: unsupported,
      startNeteaseQrAuth: unsupported,
      startNeteaseSmsAuth: unsupported,
      verifyNeteaseSmsAuth: unsupported
    };
    useDashboardStore.setState({ mode: "edit" });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AboutPage source={publicSource} />
      </QueryClientProvider>
    );

    await screen.findByRole("heading", { name: "About Me" });
    expect(screen.getByTestId("dashboard-canvas")).toHaveAttribute("data-editable", "false");
    expect(screen.queryByRole("navigation", { name: "About Me 页面操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑视图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "状态信息" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "同步" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "API 文档" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "打开设置" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Phase [15]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Published version/)).not.toBeInTheDocument();
  });

  it("keeps the edited local Draft when an API save fails", async () => {
    const failingSource: DashboardDataSource = {
      kind: "api",
      async cancelNeteaseAuthAttempt() {
        throw new Error("offline");
      },
      async connectNetease() {
        throw new Error("offline");
      },
      async disconnectNetease() {
        throw new Error("offline");
      },
      async getNeteaseConnection() {
        throw new Error("offline");
      },
      async getNeteaseAuthAttempt() {
        throw new Error("offline");
      },
      async startNeteaseQrAuth() {
        throw new Error("offline");
      },
      async startNeteaseSmsAuth() {
        throw new Error("offline");
      },
      async verifyNeteaseSmsAuth() {
        throw new Error("offline");
      },
      async getProviderConnections() {
        throw new Error("offline");
      },
      async getAuthSession() {
        return ownerSession;
      },
      async logout() {},
      async startAuthentication() {
        return { authorizationUrl: "/" };
      },
      async enqueueProviderSync() {
        throw new Error("offline");
      },
      async getSyncJob() {
        throw new Error("offline");
      },
      async load() {
        return {
          draft: { concurrencyToken: '"rev:one"', dashboard: draft },
          providerStatuses: [],
          published: mockDashboard,
          session: ownerSession
        };
      },
      async getRevision() {
        throw new Error("offline");
      },
      async listRevisions() {
        throw new Error("offline");
      },
      async publishDraft() {
        throw new Error("offline");
      },
      async refreshProjections() {
        throw new Error("offline");
      },
      async restoreRevision() {
        throw new Error("offline");
      },
      async saveDraft() {
        throw new Error("offline");
      }
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AboutPage source={failingSource} />
      </QueryClientProvider>
    );

    await screen.findByRole("heading", { name: "About Me" });
    await userEvent.click(screen.getByRole("button", { name: "编辑视图" }));
    act(() => {
      const layout = useDashboardStore
        .getState()
        .draft!.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 2 } : item));
      useDashboardStore.getState().updateBreakpointLayout("lg", layout);
    });
    await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await screen.findByText(/保存失败；当前本地草稿已保留/);
    await waitFor(() => expect(useDashboardStore.getState().dirty).toBe(true));
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(2);
  });

  it("preserves local edits on conflict until the user explicitly reloads the server Draft", async () => {
    const revisionTwoId = "00000000-0000-4000-8000-000000000302";
    const latestDraft = {
      ...draft,
      layout: {
        ...draft.layout,
        lg: draft.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 3 } : item))
      },
      revision: 2,
      revisionId: revisionTwoId
    };
    let loads = 0;
    const conflictingSource: DashboardDataSource = {
      kind: "api",
      async cancelNeteaseAuthAttempt() {
        throw new Error("not needed");
      },
      async connectNetease() {
        throw new Error("not needed");
      },
      async disconnectNetease() {
        throw new Error("not needed");
      },
      async getNeteaseConnection() {
        throw new Error("not needed");
      },
      async getNeteaseAuthAttempt() {
        throw new Error("not needed");
      },
      async startNeteaseQrAuth() {
        throw new Error("not needed");
      },
      async startNeteaseSmsAuth() {
        throw new Error("not needed");
      },
      async verifyNeteaseSmsAuth() {
        throw new Error("not needed");
      },
      async getProviderConnections() {
        throw new Error("not needed");
      },
      async getAuthSession() {
        return ownerSession;
      },
      async logout() {},
      async startAuthentication() {
        return { authorizationUrl: "/" };
      },
      async enqueueProviderSync() {
        throw new Error("not needed");
      },
      async getSyncJob() {
        throw new Error("not needed");
      },
      async load() {
        const current = loads++ === 0 ? draft : latestDraft;
        return {
          draft: {
            concurrencyToken: current === draft ? '"rev:one"' : '"rev:two"',
            dashboard: current
          },
          providerStatuses: [],
          published: mockDashboard,
          session: ownerSession
        };
      },
      async getRevision() {
        throw new Error("not needed");
      },
      async listRevisions() {
        return { items: [], nextCursor: null };
      },
      async publishDraft() {
        throw new RevisionConflictError('"rev:two"', revisionTwoId, 2);
      },
      async refreshProjections() {
        throw new Error("not needed");
      },
      async restoreRevision() {
        throw new Error("not needed");
      },
      async saveDraft() {
        throw new RevisionConflictError('"rev:two"', revisionTwoId, 2);
      }
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AboutPage source={conflictingSource} />
      </QueryClientProvider>
    );

    await screen.findByRole("heading", { name: "About Me" });
    await userEvent.click(screen.getByRole("button", { name: "编辑视图" }));
    act(() => {
      const layout = useDashboardStore
        .getState()
        .draft!.layout.lg.map((item, index) => (index === 0 ? { ...item, x: 2 } : item));
      useDashboardStore.getState().updateBreakpointLayout("lg", layout);
    });
    await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await screen.findByRole("dialog", { name: "检测到新的版本" });
    expect(useDashboardStore.getState().dirty).toBe(true);
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(2);
    expect(useDashboardStore.getState().concurrencyToken).toBe('"rev:one"');

    await userEvent.click(screen.getByRole("button", { name: "保留本地修改" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "检测到新的版本" })).not.toBeInTheDocument()
    );
    expect(useDashboardStore.getState().dirty).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await screen.findByRole("dialog", { name: "检测到新的版本" });
    await userEvent.click(screen.getByRole("button", { name: "加载服务器版本" }));
    await waitFor(() => expect(useDashboardStore.getState().dirty).toBe(false));
    expect(useDashboardStore.getState().draft?.layout.lg[0]?.x).toBe(3);
    expect(useDashboardStore.getState().concurrencyToken).toBe('"rev:two"');
  });
});
