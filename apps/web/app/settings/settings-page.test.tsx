import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import SettingsPage from "./page";

afterEach(cleanup);

describe("Settings Mock Provider boundary", () => {
  it("does not simulate QR, SMS, or MUSIC_U authentication in Mock Mode", async () => {
    render(<SettingsPage />);

    expect(await screen.findByText("当前为 Mock Mode")).toBeInTheDocument();
    expect(screen.getByText(/Mock Source 不会访问网易云/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成登录二维码" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送验证码" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/MUSIC_U Cookie value/)).not.toBeInTheDocument();
  });

  it("keeps browser-local appearance settings available", async () => {
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "保存外观设置" }));
    expect(screen.getByRole("button", { name: "已保存到浏览器" })).toBeInTheDocument();
  });
});
