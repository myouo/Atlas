import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
});

test("display and edit modes share the canvas while editing chrome stays isolated", async ({
  page
}) => {
  const canvas = page.getByTestId("dashboard-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("button", { name: /^拖动/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^移除/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "历史版本" })).toHaveCount(0);

  await page.getByRole("button", { name: "编辑视图" }).click();
  await expect(page.getByTestId("dashboard-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /^拖动/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^移除/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "历史版本" })).toBeVisible();

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存到当前浏览器")).toBeVisible();
  await page.getByRole("button", { name: "发布布局" }).click();
  await expect(page.getByRole("button", { name: /^拖动/ })).toHaveCount(0);
});

test("adds and removes a distinct Widget instance", async ({ page }) => {
  await page.getByRole("button", { name: "编辑视图" }).click();
  const githubShells = page.getByRole("region", { name: /^GitHub/ });
  const initialCount = await githubShells.count();

  await page.getByRole("button", { name: "添加模块" }).first().click();
  await page.getByRole("button", { name: /GitHub.*仓库/ }).click();
  await expect(githubShells).toHaveCount(initialCount + 1);

  await page.getByRole("button", { name: /移除 GitHub · 新实例/ }).click();
  await expect(githubShells).toHaveCount(initialCount);
});

test("resizes a module and persists the draft layout locally", async ({ page, isMobile }) => {
  await page.getByRole("button", { name: "编辑视图" }).click();
  const item = page
    .locator(".react-grid-item")
    .filter({ has: page.getByLabel("Profile") })
    .first();
  const before = await item.boundingBox();
  const handle = item.locator(".react-resizable-handle-se");
  const handleBox = await handle.boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2 + (isMobile ? 0 : 100),
    handleBox!.y + handleBox!.height / 2 + 60,
    { steps: 10 }
  );
  await page.mouse.up();
  const after = await item.boundingBox();
  expect(after!.width > before!.width || after!.height > before!.height).toBe(true);

  await page.getByRole("button", { name: "保存草稿" }).click();
  const persisted = await page.evaluate(() => localStorage.getItem("nivalis.dashboard.v3"));
  expect(persisted).toContain("manualOverrides");
});

test("mobile layout remains within the viewport", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile project only");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("status and sync controls expose explicit Phase 1 mock state", async ({ page }) => {
  await page.getByRole("button", { name: /状态信息/ }).click();
  await expect(page.getByRole("dialog", { name: "Provider 状态" })).toBeVisible();
  await expect(page.getByText(/Fixture 仅用于开发与测试/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^同步$/ }).click();
  await expect(page.getByRole("button", { name: "已同步" })).toBeVisible({ timeout: 4_000 });
  await expect(page.getByText("Mock 同步完成；未访问任何 Provider")).toBeVisible();
});

test("background management is isolated to Settings", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Background" })).toHaveCount(0);
  await page.getByRole("link", { name: "打开设置" }).click();
  await expect(page.getByRole("heading", { name: "Background" })).toBeVisible();
  await page.getByRole("button", { name: "保存外观设置" }).click();
  await expect(page.getByRole("button", { name: "已保存到浏览器" })).toBeVisible();
});
