import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModuleShell } from "./module-shell";

describe("ModuleShell", () => {
  it("hides all editing chrome in display mode", () => {
    render(
      <ModuleShell accent="blue" editable={false} onRemove={() => undefined} title="GitHub">
        Content
      </ModuleShell>
    );
    expect(screen.queryByRole("button", { name: "拖动 GitHub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移除 GitHub" })).not.toBeInTheDocument();
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
});
