import { expect, test } from "@playwright/test";

test("API mode persists, rejects stale clients, and restores immutable history", async ({
  browser,
  page
}) => {
  await authenticateOwner(page);
  const api = page.context().request;
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Phase 5 · Netease Provider")).toBeVisible();

  const initialResponse = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  expect(initialResponse.ok()).toBe(true);
  const initialDashboard = await initialResponse.json();
  const profileId = initialDashboard.widgets.find(
    (widget: { readonly type: string }) => widget.type === "profile.hero"
  ).id;
  const initialProfileLayout = initialDashboard.layout.lg.find(
    (item: { readonly i: string }) => item.i === profileId
  );
  const initialRevisionEtag = initialResponse.headers()["etag"];
  const initialHistory = await (
    await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/revisions")
  ).json();
  const publicBeforeSyncResponse = await api.get(
    "http://127.0.0.1:3002/v1/public/dashboards/about"
  );
  const publicBeforeSync = await publicBeforeSyncResponse.json();
  expect(githubStars(publicBeforeSync)).toBe(1_248);

  await page.getByRole("button", { name: "同步" }).click();
  await expect(page.getByRole("button", { exact: true, name: "同步" })).toBeDisabled();
  await expect(
    page.getByText("Provider 同步完成；Live Projection 已更新，草稿 Revision 未改变")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "已同步" })).toBeVisible();
  const publicAfterSyncResponse = await api.get("http://127.0.0.1:3002/v1/public/dashboards/about");
  expect(githubStars(await publicAfterSyncResponse.json())).toBe(1_291);
  expect(publicAfterSyncResponse.headers()["etag"]).not.toBe(
    publicBeforeSyncResponse.headers()["etag"]
  );
  const draftAfterSync = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  expect(draftAfterSync.headers()["etag"]).toBe(initialRevisionEtag);
  const historyAfterSync = await (
    await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/revisions")
  ).json();
  expect(historyAfterSync.items).toHaveLength(initialHistory.items.length);

  await page.getByRole("button", { name: "编辑视图" }).click();
  const githubRegions = page.getByRole("region", { name: /^GitHub/ });
  await expect(githubRegions).toHaveCount(1);

  await page.getByRole("button", { name: "添加模块" }).first().click();
  await page.getByRole("button", { name: /GitHub.*仓库/ }).click();
  await expect(githubRegions).toHaveCount(2);

  const profileItem = page
    .locator(".react-grid-item")
    .filter({ has: page.getByLabel("Profile") })
    .first();
  const before = await profileItem.boundingBox();
  const handleBox = await profileItem.locator(".react-resizable-handle-se").boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 90, handleBox!.y + 60, {
    steps: 10
  });
  await page.mouse.up();
  const resized = await profileItem.boundingBox();
  expect(resized!.width > before!.width || resized!.height > before!.height).toBe(true);

  await expect(page.getByText("草稿有未保存调整")).toBeVisible();
  await expect(
    page.getByText("Provider 同步完成；Live Projection 已更新，草稿 Revision 未改变")
  ).not.toBeVisible();
  const secondSyncCompleted = page.waitForResponse(async (response) => {
    if (!response.url().includes("/v1/me/sync-jobs/") || response.request().method() !== "GET") {
      return false;
    }
    return ((await response.json()) as { readonly status?: string }).status === "completed";
  });
  await page.getByRole("button", { name: "已同步" }).click();
  await secondSyncCompleted;
  await expect(
    page.getByText("Provider 同步完成；Live Projection 已更新，草稿 Revision 未改变")
  ).toBeVisible();
  await expect(page.getByText("草稿有未保存调整")).toBeVisible();

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("草稿已保存到服务端持久化存储")).toBeVisible();
  const savedResponse = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  const savedDashboard = await savedResponse.json();
  const savedProfileLayout = savedDashboard.layout.lg.find(
    (item: { readonly i: string }) => item.i === profileId
  );
  expect(
    savedProfileLayout.w > initialProfileLayout.w || savedProfileLayout.h > initialProfileLayout.h
  ).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "编辑视图" }).click();
  await expect(page.getByRole("region", { name: /^GitHub/ })).toHaveCount(2);
  const reloadedResponse = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  const reloadedDashboard = await reloadedResponse.json();
  expect(
    reloadedDashboard.layout.lg.find((item: { readonly i: string }) => item.i === profileId)
  ).toMatchObject({ h: savedProfileLayout.h, w: savedProfileLayout.w });

  await page.getByRole("button", { name: "发布布局" }).click();
  await expect(page.getByText("草稿已显式发布到展示视图")).toBeVisible();
  await expect(page.getByRole("button", { name: /^拖动/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^GitHub/ })).toHaveCount(2);

  await page.reload();
  await expect(page.getByRole("region", { name: /^GitHub/ })).toHaveCount(2);

  const publicResponse = await api.get("http://127.0.0.1:3002/v1/public/dashboards/about");
  expect(publicResponse.ok()).toBe(true);
  const publicDashboard = await publicResponse.json();
  expect(publicDashboard.widgets).toHaveLength(11);
  expect(
    publicDashboard.layout.lg.find((item: { readonly i: string }) => item.i === profileId)
  ).toMatchObject({ h: savedProfileLayout.h, w: savedProfileLayout.w });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await Promise.all([authenticateOwner(pageA), authenticateOwner(pageB)]);
  await Promise.all([pageA.goto("http://127.0.0.1:4174"), pageB.goto("http://127.0.0.1:4174")]);
  await Promise.all([
    pageA.getByRole("button", { name: "编辑视图" }).click(),
    pageB.getByRole("button", { name: "编辑视图" }).click()
  ]);
  const initialGithubCount = await pageA.getByRole("region", { name: /^GitHub/ }).count();
  for (const clientPage of [pageA, pageB]) {
    await clientPage.getByRole("button", { name: "添加模块" }).first().click();
    await clientPage.getByRole("button", { name: /GitHub.*仓库/ }).click();
    await expect(clientPage.getByRole("region", { name: /^GitHub/ })).toHaveCount(
      initialGithubCount + 1
    );
  }

  await pageA.getByRole("button", { name: "保存草稿" }).click();
  await expect(pageA.getByText("草稿已保存到服务端持久化存储")).toBeVisible();
  await pageB.getByRole("button", { name: "保存草稿" }).click();
  await expect(pageB.getByRole("dialog", { name: "检测到新的版本" })).toBeVisible();
  await expect(pageB.getByText("草稿有未保存调整")).toBeVisible();
  await pageB.getByRole("button", { exact: true, name: "保留本地修改" }).click();
  await expect(pageB.getByRole("region", { name: /^GitHub/ })).toHaveCount(initialGithubCount + 1);
  await expect(pageB.getByText("草稿有未保存调整")).toBeVisible();
  await Promise.all([contextA.close(), contextB.close()]);

  await page.reload();
  await page.getByRole("button", { name: "编辑视图" }).click();
  await page.getByRole("button", { name: "历史版本" }).click();
  const revisionOne = page.locator("article").filter({ hasText: "Revision 1" });
  await expect(revisionOne).toBeVisible();
  await revisionOne.getByRole("button", { name: "恢复" }).click();
  await expect(page.getByText("确认恢复 Revision 1？")).toBeVisible();
  await page.getByRole("button", { name: "恢复为新草稿" }).click();
  await expect(page.getByText(/已创建恢复后的新草稿 Revision 4/)).toBeVisible();
  await expect(page.getByRole("region", { name: /^GitHub/ })).toHaveCount(1);

  const historyResponse = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/revisions");
  const history = await historyResponse.json();
  expect(
    history.items.map((revision: { readonly revisionNumber: number }) => revision.revisionNumber)
  ).toEqual([4, 3, 2, 1]);
  const restoredDetailResponse = await api.get(
    `http://127.0.0.1:3002/v1/me/dashboards/about/revisions/${history.items[0].revisionId}`
  );
  expect(await restoredDetailResponse.json()).toMatchObject({
    parentRevisionId: history.items[1].revisionId,
    restoredFromRevisionId: history.items[3].revisionId
  });
  expect(
    (await (await api.get("http://127.0.0.1:3002/v1/public/dashboards/about")).json()).widgets
  ).toHaveLength(11);

  await page.getByRole("button", { name: "发布布局" }).click();
  await expect(page.getByText("草稿已显式发布到展示视图")).toBeVisible();
  expect(
    (await (await api.get("http://127.0.0.1:3002/v1/public/dashboards/about")).json()).widgets
  ).toHaveLength(10);

  const draftBeforeNetease = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  const dataBeforeNetease = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/data");
  const viewBeforeNetease = await api.get("http://127.0.0.1:3002/v1/public/dashboards/about");
  const historyBeforeNetease = await (
    await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/revisions")
  ).json();

  await page.goto("/settings");
  await page.getByRole("button", { name: "生成登录二维码" }).click();
  await expect(page.getByLabel("网易云登录二维码")).toBeVisible();
  await expect(page.getByText(/网易云登录成功；MUSIC_U 已加密保存/)).toBeVisible({
    timeout: 20_000
  });
  await expect
    .poll(
      async () => {
        const dashboard = await (
          await api.get("http://127.0.0.1:3002/v1/public/dashboards/about")
        ).json();
        const netease = dashboard.widgets.find(
          (widget: { readonly type: string }) => widget.type === "music.netease.overview"
        );
        return netease?.data?.weeklyListening?.topTracks?.[0]?.track?.name ?? null;
      },
      { timeout: 20_000 }
    )
    .toBe("Snow Light");
  await page.goto("/");
  await expect(page.getByText("Snow Light")).toBeVisible();
  await expect(page.getByText("91 分钟")).toBeVisible();

  const draftAfterNetease = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  const dataAfterNetease = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/data");
  const viewAfterNetease = await api.get("http://127.0.0.1:3002/v1/public/dashboards/about");
  const historyAfterNetease = await (
    await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/revisions")
  ).json();
  expect(draftAfterNetease.headers()["etag"]).toBe(draftBeforeNetease.headers()["etag"]);
  expect(dataAfterNetease.headers()["etag"]).not.toBe(dataBeforeNetease.headers()["etag"]);
  expect(viewAfterNetease.headers()["etag"]).not.toBe(viewBeforeNetease.headers()["etag"]);
  expect(historyAfterNetease.items).toHaveLength(historyBeforeNetease.items.length);

  await page.goto("/settings");
  await page.getByRole("button", { name: "断开并删除凭据" }).click();
  await page.reload();
  const freshQrResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/v1/me/providers/netease/auth-attempts/qr") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "生成登录二维码" }).click();
  const freshQr = await (await freshQrResponse).json();
  expect(freshQr.status).toBe("queued");
  await expect(page.getByLabel("网易云登录二维码")).toBeVisible();
  await expect(page.getByText(/等待网易云 App 扫码|已扫码，请在网易云 App 中确认/)).toBeVisible();
  await expect(page.getByText(/网易云登录成功；MUSIC_U 已加密保存/)).not.toBeVisible();
  await page.getByRole("button", { name: "取消本次登录" }).click();
  await expect(page.getByRole("button", { name: "生成登录二维码" })).toBeVisible();
  await page.getByRole("tab", { name: "验证码" }).click();
  await page.getByLabel("手机号").fill("13800138000");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByText(/\+86 138\*{4}8000/)).toBeVisible();
  await page.getByPlaceholder("输入短信验证码").fill("123456");
  await page.getByRole("button", { name: "验证并连接" }).click();
  await expect(page.getByText(/网易云登录成功；MUSIC_U 已加密保存/)).toBeVisible({
    timeout: 15_000
  });
  const draftAfterSms = await api.get("http://127.0.0.1:3002/v1/me/dashboards/about/draft");
  expect(draftAfterSms.headers()["etag"]).toBe(draftBeforeNetease.headers()["etag"]);
});

function githubStars(dashboard: {
  readonly widgets: readonly {
    readonly data?: { readonly stars?: number };
    readonly type: string;
  }[];
}) {
  return dashboard.widgets.find((widget) => widget.type === "github.profile")?.data?.stars;
}

async function authenticateOwner(page: import("@playwright/test").Page) {
  await page.goto("http://127.0.0.1:4174/settings");
  const login = page.getByRole("button", { name: "使用 GitHub 登录" });
  const logout = page.getByRole("button", { name: "退出登录" });
  await expect(login.or(logout)).toBeVisible();
  if (await login.isVisible()) {
    await login.click();
    await page.waitForURL(/\/settings\?auth=success/);
  }
}
