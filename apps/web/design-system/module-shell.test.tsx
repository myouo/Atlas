import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModuleShell, useModuleShellExpansion, useModuleShellTransientState } from "./module-shell";

describe("ModuleShell", () => {
  it("hides all editing chrome in display mode", () => {
    render(
      <ModuleShell accent="blue" editable={false} onRemove={() => undefined} title="GitHub">
        Content
      </ModuleShell>
    );
    expect(screen.queryByRole("button", { name: "拖动 GitHub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移除 GitHub" })).not.toBeInTheDocument();
    expect(screen.getByTestId("module-shell")).toHaveClass("module-shell", "select-none");
    expect(screen.getByTestId("module-shell")).toHaveAttribute("data-kind", "standard");
  });

  it("exposes unified drag and remove controls in edit mode", async () => {
    const onRemove = vi.fn();
    render(
      <ModuleShell accent="ink" editable onRemove={onRemove} title="GitHub">
        Content
      </ModuleShell>
    );
    expect(screen.getByRole("button", { name: "拖动 GitHub" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "移除 GitHub" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("opens expandable content in an accessible viewport overlay", async () => {
    render(
      <ModuleShell accent="coral" editable={false} expandable title="听歌榜单">
        <p>完整榜单内容</p>
      </ModuleShell>
    );

    await userEvent.click(screen.getByRole("button", { name: "放大 听歌榜单" }));
    expect(await screen.findByRole("dialog", { name: "听歌榜单" })).toBeVisible();
    expect(screen.getByText("完整榜单内容")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "关闭 听歌榜单 全屏视图" }));
    expect(screen.queryByRole("dialog", { name: "听歌榜单" })).not.toBeInTheDocument();
  });

  it("preserves transient Widget view state when content moves into and out of the overlay", async () => {
    render(
      <ModuleShell accent="coral" editable={false} expandable title="状态保留">
        <TransientStateFixture />
      </ModuleShell>
    );

    await userEvent.click(screen.getByRole("button", { name: "切换 compact" }));
    expect(screen.getByRole("button", { name: "切换 selected" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "放大 状态保留" }));
    const dialog = await screen.findByRole("dialog", { name: "状态保留" });
    expect(screen.getByRole("button", { name: "切换 selected" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "切换 selected" }));
    expect(screen.getByRole("button", { name: "切换 expanded" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "关闭 状态保留 全屏视图" }));
    expect(dialog).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换 expanded" })).toBeVisible();
  });
});

function TransientStateFixture() {
  const expanded = useModuleShellExpansion();
  const [value, setValue] = useModuleShellTransientState("module-shell-test-state", "compact");
  return (
    <button onClick={() => setValue(expanded ? "expanded" : "selected")} type="button">
      切换 {value}
    </button>
  );
}
