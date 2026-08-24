import type { DashboardDataSource } from "../../api/dashboard-source";
import type { DashboardRevisionDetail } from "@nivalis/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { mockDashboard } from "./mock-dashboard";
import { RevisionHistoryDialog } from "./revision-history-dialog";

const revisionOneId = "00000000-0000-4000-8000-000000000301";
const revisionTwoId = "00000000-0000-4000-8000-000000000302";

it("previews history and requires confirmation before Restore", async () => {
  const onRestore = vi.fn();
  const source = historySource();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RevisionHistoryDialog
        onOpenChange={vi.fn()}
        onRestore={onRestore}
        open
        restoring={false}
        source={source}
      />
    </QueryClientProvider>
  );

  await screen.findByRole("dialog", { name: "历史版本" });
  expect(await screen.findByText("当前草稿")).toBeVisible();
  expect(screen.getByText("当前发布")).toBeVisible();
  const revisionOne = screen.getByRole("heading", { name: "Revision 1" }).closest("article");
  expect(revisionOne).not.toBeNull();

  await userEvent.click(within(revisionOne!).getByRole("button", { name: "预览" }));
  expect(await screen.findByText("Widgets")).toBeVisible();
  expect(screen.getAllByText(String(mockDashboard.widgets.length))).toHaveLength(2);

  await userEvent.click(within(revisionOne!).getByRole("button", { name: "恢复" }));
  expect(screen.getByText("确认恢复 Revision 1？")).toBeVisible();
  expect(onRestore).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "恢复为新草稿" }));
  expect(onRestore).toHaveBeenCalledWith(revisionOneId);
});

function historySource(): DashboardDataSource {
  const detail: DashboardRevisionDetail = {
    createdAt: "2026-08-23T04:30:00.000Z",
    dashboardId: "about",
    isCurrentDraft: false,
    isCurrentPublished: true,
    layout: mockDashboard.layout,
    operation: "seed",
    parentRevisionId: null,
    profile: mockDashboard.profile,
    restoredFromRevisionId: null,
    revisionId: revisionOneId,
    revisionNumber: 1,
    widgets: mockDashboard.widgets.map((widget) => ({
      dataConfig: widget.dataConfig,
      enabled: widget.enabled,
      id: widget.id,
      presentationConfig: widget.presentationConfig,
      provider: widget.provider,
      schemaVersion: widget.schemaVersion,
      title: widget.title,
      type: widget.type
    }))
  };
  return {
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
      return {
        actorId: "00000000-0000-4000-8000-000000000001",
        authenticated: true,
        expiresAt: "2099-01-01T00:00:00.000Z",
        role: "owner"
      } as const;
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
    async listRevisions() {
      return {
        items: [
          {
            ...detail,
            isCurrentDraft: true,
            isCurrentPublished: false,
            operation: "save",
            parentRevisionId: revisionOneId,
            revisionId: revisionTwoId,
            revisionNumber: 2
          },
          detail
        ],
        nextCursor: null
      };
    },
    async getRevision() {
      return detail;
    },
    async load() {
      throw new Error("not needed");
    },
    async publishDraft() {
      throw new Error("not needed");
    },
    async refreshProjections() {
      throw new Error("not needed");
    },
    async restoreRevision() {
      throw new Error("not needed");
    },
    async saveDraft() {
      throw new Error("not needed");
    }
  };
}
