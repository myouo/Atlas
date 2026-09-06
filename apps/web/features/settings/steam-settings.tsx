"use client";

import { ArrowClockwise, GameController, LinkBreak } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dashboardSource } from "../../api/dashboard-source-factory";
import { SteamDataExplorer } from "./steam-data-explorer";

const statusLabels = {
  not_configured: "未连接",
  pending_validation: "验证中",
  valid: "已连接",
  expired: "已过期",
  invalid: "凭据无效",
  revoked: "已撤销"
};

export function SteamSettings({ owner }: { readonly owner: boolean }) {
  const [steamId, setSteamId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const finished = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const apiMode = dashboardSource.kind === "api";
  const connection = useQuery({
    queryKey: ["provider-connection", "steam", dashboardSource.kind],
    queryFn: () => dashboardSource.getSteamConnection(),
    enabled: owner && apiMode,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.credentialStatus === "pending_validation" ? 2000 : false
  });
  const job = useQuery({
    queryKey: ["sync-job", jobId, dashboardSource.kind],
    queryFn: () => dashboardSource.getSyncJob(jobId!),
    enabled: apiMode && jobId !== null,
    refetchInterval: (query) =>
      !query.state.data || ["queued", "running", "retrying"].includes(query.state.data.status)
        ? 1000
        : false
  });
  const connect = useMutation({
    mutationFn: () => dashboardSource.connectSteam(steamId.trim(), apiKey.trim()),
    onSuccess: async (result) => {
      setApiKey("");
      setReconnecting(false);
      setJobId(result.validationJob.jobId);
      setNotice("凭据已加密保存，正在验证并读取 Steam 数据。");
      await queryClient.invalidateQueries({ queryKey: ["provider-connection", "steam"] });
    },
    onError: () => setNotice("连接失败。请检查 Steam 主页链接或 ID、API Key 和服务状态后重试。")
  });
  const sync = useMutation({
    mutationFn: () => dashboardSource.enqueueProviderSync("steam"),
    onSuccess: (result) => {
      setJobId(result.jobId);
      setNotice("Steam 同步任务已提交。");
    },
    onError: () => setNotice("暂时无法提交同步，请稍后重试。")
  });
  const disconnect = useMutation({
    mutationFn: () => dashboardSource.disconnectSteam(),
    onSuccess: async () => {
      setApiKey("");
      setJobId(null);
      setReconnecting(false);
      setNotice("Steam 凭据已删除。已发布内容仍会保留；如需移除，请编辑并重新发布页面。");
      await queryClient.invalidateQueries({ queryKey: ["provider-connection", "steam"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => setNotice("断开失败，请稍后重试。")
  });
  useEffect(() => {
    const value = job.data;
    if (
      !value ||
      !["completed", "failed"].includes(value.status) ||
      finished.current === value.jobId
    )
      return;
    finished.current = value.jobId;
    void queryClient.invalidateQueries({ queryKey: ["provider-connection", "steam"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["provider-data", "steam"] });
  }, [job.data, queryClient]);
  const active =
    jobId !== null &&
    (job.isPending ||
      Boolean(job.data && ["queued", "running", "retrying"].includes(job.data.status)));
  const busy = connect.isPending || disconnect.isPending || sync.isPending || active;
  const configured = connection.data?.configured && connection.data.enabled;
  return (
    <section
      id="steam"
      className="settings-card glass-surface mt-4 scroll-mt-6"
      aria-label="Steam 连接"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#173b64] text-white">
          <GameController aria-hidden size={22} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="settings-card-title text-ink">Steam</h2>
          <p className="text-xs text-ink-muted">游戏库、游玩时长与最近游戏</p>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold text-ink">
          {statusLabels[connection.data?.credentialStatus ?? "not_configured"]}
        </span>
      </div>
      {!owner ? (
        <p className="mt-4 text-sm text-ink-muted">请以 Owner 身份登录后管理 Steam 连接。</p>
      ) : !apiMode ? (
        <p className="mt-4 rounded-xl bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-900">
          当前是本地示例模式。Steam 凭据输入已停用，切换到 API 模式后即可连接真实账号。
        </p>
      ) : (
        <>
          {connection.isPending ? (
            <p className="mt-4 text-xs text-ink-muted">正在读取连接状态…</p>
          ) : connection.isError ? (
            <div className="mt-4 text-xs text-rose-700" role="alert">
              <p>Steam 连接状态暂时无法读取。</p>
              <button
                type="button"
                className="jelly-control mt-2 rounded-lg bg-white/70 px-3 py-2 font-bold"
                disabled={connection.isFetching}
                onClick={() => void connection.refetch()}
              >
                重新读取
              </button>
            </div>
          ) : null}
          {configured && !reconnecting ? (
            <div className="mt-4">
              <p className="font-bold text-ink">{connection.data?.displayName ?? "Steam 账号"}</p>
              {connection.data?.providerAccountId ? (
                <p className="mt-1 text-xs tabular-nums text-ink-muted">
                  {connection.data.providerAccountId}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="settings-save"
                  disabled={busy}
                  onClick={() => sync.mutate()}
                  type="button"
                >
                  <ArrowClockwise aria-hidden size={16} />
                  {active ? "正在同步…" : "同步 Steam"}
                </button>
                <button
                  className="jelly-control rounded-xl bg-white/70 px-4 py-2 text-xs font-bold text-ink"
                  disabled={busy}
                  onClick={() => {
                    setSteamId(connection.data?.providerAccountId ?? "");
                    setReconnecting(true);
                  }}
                  type="button"
                >
                  更新凭据
                </button>
                <button
                  className="jelly-control flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700"
                  disabled={busy}
                  onClick={() => disconnect.mutate()}
                  type="button"
                >
                  <LinkBreak aria-hidden size={15} />
                  断开连接
                </button>
              </div>
            </div>
          ) : (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                connect.mutate();
              }}
            >
              <label className="text-xs font-semibold text-ink-muted">
                Steam 账号 / 个人主页
                <input
                  aria-label="SteamID64、个人主页链接或自定义 ID"
                  className="settings-select mt-2 h-11 w-full rounded-xl px-3 text-sm"
                  value={steamId}
                  onChange={(event) => setSteamId(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={512}
                  required
                  placeholder="SteamID64 或 steamcommunity.com/id/…"
                />
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Steam Web API Key
                <input
                  aria-label="Steam Web API Key"
                  className="settings-select mt-2 h-11 w-full rounded-xl px-3 text-sm"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  pattern="[a-fA-F0-9]{32}"
                  minLength={32}
                  maxLength={32}
                  required
                />
              </label>
              <p className="text-xs leading-relaxed text-ink-muted sm:col-span-2">
                支持 SteamID64、/profiles/ 或 /id/ 个人主页链接、自定义主页
                ID，以及好友代码。昵称和登录用户名不一定是主页 ID。
              </p>
              <p className="text-xs leading-relaxed text-ink-muted sm:col-span-2">
                在{" "}
                <a
                  className="underline"
                  href="https://steamcommunity.com/dev/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Steam 官方页面
                </a>
                创建 Web API Key。凭据只会提交到你的 Nivalis 服务端，并加密保存。
              </p>
              <div className="flex gap-2 sm:col-span-2">
                <button
                  className="settings-save"
                  disabled={busy || connection.isPending || connection.isError}
                  type="submit"
                >
                  {connect.isPending ? "正在连接…" : "连接并验证 Steam"}
                </button>
                {reconnecting ? (
                  <button
                    type="button"
                    className="jelly-control rounded-xl bg-white/70 px-4 text-xs text-ink"
                    onClick={() => {
                      setApiKey("");
                      setReconnecting(false);
                    }}
                  >
                    取消
                  </button>
                ) : null}
              </div>
            </form>
          )}
          <div className="mt-4 text-xs leading-relaxed text-ink-muted">
            <p>请将 Steam 个人资料和游戏详情设为公开；隐藏的游戏库或时长会显示为不可用。</p>
            <p className="mt-2">
              连接后，在首页添加 Steam 模块，保存草稿后同步，再发布展示。旧的示例卡片可移除。
            </p>
            <Link href="/" className="mt-2 inline-block font-bold text-primary underline">
              前往首页配置卡片
            </Link>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink" role="status">
            {job.data?.status === "completed"
              ? "Steam 同步完成；可用数据已更新，隐私限制的数据不会被填成零。"
              : job.data?.status === "failed"
                ? "同步失败，之前成功的数据已保留。请检查凭据和 Steam 隐私设置。"
                : notice}
          </p>
          <SteamDataExplorer enabled={Boolean(configured)} />
        </>
      )}
    </section>
  );
}
