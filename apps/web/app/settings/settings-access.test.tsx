import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import SettingsPage from "./page";

vi.mock("../../api/dashboard-source-factory", () => ({
  dashboardSource: {
    kind: "api",
    getAuthSession: async () => ({
      actorId: null,
      authenticated: false,
      expiresAt: null,
      role: null
    }),
    startAuthentication: vi.fn()
  }
}));

afterEach(cleanup);

it("keeps API settings hidden until the visitor authenticates as Owner", async () => {
  render(<SettingsPage />);

  expect(await screen.findByRole("heading", { name: "设置仅对 Owner 开放" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "使用 GitHub 登录" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Background" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "保存外观设置" })).not.toBeInTheDocument();
});
