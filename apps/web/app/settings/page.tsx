"use client";

import type { ProviderAuthAttempt, ProviderConnection, SyncJob } from "@nivalis/api-client";
import {
  ArrowLeft,
  Check,
  CloudArrowUp,
  Eye,
  GithubLogo,
  ImageSquare,
  LinkBreak,
  MusicNotes,
  Palette,
  ShieldCheck,
  SignOut,
  TextAa
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

import { dashboardSource } from "../../api/dashboard-source-factory";
import { AppProviders } from "../providers";

type Accent = "blue" | "lilac" | "rose";
type Glass = "balanced" | "strong" | "subtle";

export default function SettingsPage() {
  return (
    <AppProviders>
      <SettingsContent />
    </AppProviders>
  );
}

function SettingsContent() {
  const [accent, setAccent] = useState<Accent>("blue");
  const [glass, setGlass] = useState<Glass>("balanced");
  const [rotation, setRotation] = useState(false);
  const [saved, setSaved] = useState(false);
  const [credential, setCredential] = useState("");
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [validationJob, setValidationJob] = useState<SyncJob | null>(null);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryFn: () => dashboardSource.getAuthSession(),
    queryKey: ["auth-session", dashboardSource.kind],
    retry: false
  });
  const authenticated = sessionQuery.data?.authenticated ?? false;
  const owner = sessionQuery.data?.authenticated && sessionQuery.data.role === "owner";
  const connectionQuery = useQuery({
    enabled: Boolean(owner),
    queryFn: () => dashboardSource.getNeteaseConnection(),
    queryKey: ["provider-connection", "netease", dashboardSource.kind],
    refetchInterval: (query) =>
      query.state.data?.credentialStatus === "pending_validation" ? 1_000 : false,
    retry: false
  });
  const loginMutation = useMutation({
    mutationFn: () => dashboardSource.startAuthentication(),
    onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl)
  });
  const logoutMutation = useMutation({
    mutationFn: () => dashboardSource.logout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
      queryClient.removeQueries({ queryKey: ["provider-connection"] });
    }
  });
  const connectMutation = useMutation({
    mutationFn: (musicU: string) => dashboardSource.connectNetease(musicU),
    onError: () => setProviderNotice("连接失败。凭据仍只保留在当前输入框中，可检查后重试。"),
    onSuccess: async (accepted) => {
      setCredential("");
      setValidationJob(accepted.validationJob);
      setProviderNotice("凭据已加密保存，正在由独立 Worker 验证。");
      await queryClient.invalidateQueries({ queryKey: ["provider-connection", "netease"] });
    }
  });
  const disconnectMutation = useMutation({
    mutationFn: () => dashboardSource.disconnectNetease(),
    onError: () => setProviderNotice("断开失败，请稍后重试。"),
    onSuccess: async () => {
      setValidationJob(null);
      setProviderNotice("网易云凭据已删除；历史 Raw/Native/Projection 数据未被删除。");
      await queryClient.invalidateQueries({ queryKey: ["provider-connection", "netease"] });
    }
  });

  useEffect(() => {
    const id = validationJob?.jobId;
    if (!id || ["completed", "failed"].includes(validationJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void dashboardSource
        .getSyncJob(id)
        .then(async (job) => {
          if (cancelled) return;
          setValidationJob(job);
          if (job.status === "completed" || job.status === "failed") {
            window.clearInterval(timer);
            setProviderNotice(
              job.status === "completed"
                ? "网易云连接已验证，真实数据已生成 Projection。"
                : "验证失败。Last Known Good 数据会保留，请重新连接后再试。"
            );
            await queryClient.invalidateQueries({
              queryKey: ["provider-connection", "netease"]
            });
          }
        })
        .catch(() => undefined);
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [queryClient, validationJob?.jobId, validationJob?.status]);

  const save = () => {
    localStorage.setItem(
      "nivalis.appearance.phase1.v1",
      JSON.stringify({ accent, glass, rotation })
    );
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2_000);
  };

  return (
    <main className="nivalis-page">
      <div className="nivalis-content max-w-[1120px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            className="glass-surface-strong flex h-11 items-center gap-2 rounded-full px-4 text-xs font-extrabold text-ink transition hover:bg-white"
            href="/"
          >
            <ArrowLeft aria-hidden size={16} weight="bold" />
            返回 About Me
          </Link>
          <div className="flex items-center gap-2">
            {authenticated ? (
              <button
                className="glass-surface-strong flex h-10 items-center gap-2 rounded-full px-4 text-[11px] font-extrabold text-ink"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
                type="button"
              >
                <SignOut aria-hidden size={15} weight="bold" />
                退出登录
              </button>
            ) : null}
            <span className="rounded-full bg-blue-500 px-4 py-2 text-xs font-extrabold text-white shadow-lg">
              Settings
            </span>
          </div>
        </header>

        <div className="mt-16 sm:mt-20">
          <p className="text-xs font-extrabold tracking-[0.18em] text-blue-600 uppercase">
            Personalize your canvas
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] text-ink sm:text-5xl">
            外观与数据设置
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed font-medium text-ink-muted">
            背景、字体、主题、玻璃强度、Provider 和隐私设置只存在于这里，不会占据 About Me 首页。
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="glass-surface rounded-[26px] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <ImageSquare aria-hidden size={21} weight="duotone" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-ink">Background</h2>
                <p className="text-[11px] text-ink-muted">选择首页背景与轮换方式</p>
              </div>
            </div>
            <button
              aria-pressed="true"
              className="relative mt-5 block w-full overflow-hidden rounded-[20px] border-2 border-blue-500 bg-white/50 p-2 text-left"
              type="button"
            >
              <Image
                alt="雪蓝城市背景预览"
                className="aspect-[16/7] w-full rounded-[14px] object-cover object-top"
                height={620}
                loading="eager"
                src="/images/nivalis-background.jpg"
                width={1100}
              />
              <span className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                <Check aria-hidden size={14} weight="bold" />
              </span>
              <span className="mt-3 block px-1 pb-1 text-xs font-extrabold text-ink">
                雪蓝晨光 · 默认
              </span>
            </button>
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-2xl border border-white/80 bg-white/50 px-4 py-3">
              <span>
                <span className="block text-xs font-extrabold text-ink">Background rotation</span>
                <span className="mt-0.5 block text-[10px] text-ink-muted">
                  后续阶段将接入对象存储中的背景集合
                </span>
              </span>
              <input
                checked={rotation}
                className="h-4 w-4 accent-blue-600"
                onChange={(event) => setRotation(event.target.checked)}
                type="checkbox"
              />
            </label>
          </section>

          <div className="space-y-5">
            <section className="glass-surface rounded-[26px] p-5">
              <div className="flex items-center gap-3">
                <Palette aria-hidden className="text-blue-600" size={22} weight="duotone" />
                <h2 className="text-base font-extrabold text-ink">Theme & Accent</h2>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["blue", "lilac", "rose"] as const).map((value) => (
                  <button
                    aria-label={`Accent ${value}`}
                    aria-pressed={accent === value}
                    className={
                      accent === value
                        ? "h-10 rounded-xl border-2 border-blue-600 bg-white/80 text-[10px] font-bold text-ink"
                        : "h-10 rounded-xl border border-white/80 bg-white/45 text-[10px] font-bold text-ink-muted"
                    }
                    key={value}
                    onClick={() => setAccent(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>

            <section className="glass-surface rounded-[26px] p-5">
              <div className="flex items-center gap-3">
                <TextAa aria-hidden className="text-blue-600" size={22} weight="duotone" />
                <h2 className="text-base font-extrabold text-ink">Font & Glass</h2>
              </div>
              <label className="mt-4 block text-[10px] font-bold text-ink-muted">
                字体
                <select className="mt-2 h-10 w-full rounded-xl border border-white/90 bg-white/70 px-3 text-xs font-semibold text-ink">
                  <option>Noto Sans SC</option>
                  <option>System Sans</option>
                </select>
              </label>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["subtle", "balanced", "strong"] as const).map((value) => (
                  <button
                    aria-pressed={glass === value}
                    className={
                      glass === value
                        ? "rounded-xl bg-blue-600 px-2 py-2 text-[10px] font-bold text-white"
                        : "rounded-xl bg-white/55 px-2 py-2 text-[10px] font-bold text-ink-muted"
                    }
                    key={value}
                    onClick={() => setGlass(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <ProviderSettings
            authenticated={authenticated}
            connection={connectionQuery.data}
            credential={credential}
            error={sessionQuery.isError || connectionQuery.isError}
            loading={sessionQuery.isLoading || (Boolean(owner) && connectionQuery.isLoading)}
            notice={providerNotice}
            onConnect={() => {
              setProviderNotice(null);
              connectMutation.mutate(credential);
            }}
            onAuthConnected={() => {
              setProviderNotice("网易云登录成功；MUSIC_U 已加密保存，Worker 正在验证数据权限。");
              void queryClient.invalidateQueries({
                queryKey: ["provider-connection", "netease"]
              });
            }}
            onBeginReconnect={() => {
              setValidationJob(null);
              setProviderNotice(null);
            }}
            onCredentialChange={setCredential}
            onDisconnect={() => disconnectMutation.mutate()}
            onLogin={() => loginMutation.mutate()}
            owner={Boolean(owner)}
            pending={
              loginMutation.isPending || connectMutation.isPending || disconnectMutation.isPending
            }
            sourceKind={dashboardSource.kind}
            validationJob={validationJob}
          />

          <section className="glass-surface rounded-[26px] p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck aria-hidden className="text-blue-600" size={22} weight="duotone" />
              <div>
                <h2 className="text-base font-extrabold text-ink">Privacy</h2>
                <p className="text-[10px] text-ink-muted">公共 Dashboard 使用显式字段白名单</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/80 bg-white/45 p-4">
              <Eye aria-hidden className="text-blue-500" size={20} weight="duotone" />
              <p className="mt-3 text-xs font-extrabold text-ink">Published data only</p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">
                Draft、凭据、Raw Snapshot 与 Provider 错误详情永远不会进入公共 Read Model。MUSIC_U
                只写入 Nivalis API，并以 AEAD 密文保存。
              </p>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-lg transition hover:bg-blue-700"
            onClick={save}
            type="button"
          >
            <Check aria-hidden size={16} weight="bold" />
            {saved ? "已保存到浏览器" : "保存外观设置"}
          </button>
        </div>
      </div>
    </main>
  );
}

interface ProviderSettingsProps {
  readonly authenticated: boolean;
  readonly connection: ProviderConnection | undefined;
  readonly credential: string;
  readonly error: boolean;
  readonly loading: boolean;
  readonly notice: string | null;
  readonly onConnect: () => void;
  readonly onAuthConnected: () => void;
  readonly onBeginReconnect: () => void;
  readonly onCredentialChange: (value: string) => void;
  readonly onDisconnect: () => void;
  readonly onLogin: () => void;
  readonly owner: boolean;
  readonly pending: boolean;
  readonly sourceKind: "api" | "mock";
  readonly validationJob: SyncJob | null;
}

function ProviderSettings(props: ProviderSettingsProps) {
  const status = props.connection?.credentialStatus ?? "not_configured";
  const [reconnecting, setReconnecting] = useState(false);
  const [authMethod, setAuthMethod] = useState<"manual" | "qr" | "sms">("qr");
  const [authAttempt, setAuthAttempt] = useState<ProviderAuthAttempt | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("86");
  const [smsCode, setSmsCode] = useState("");
  const completedAttempt = useRef<string | null>(null);
  const attemptQuery = useQuery({
    enabled: Boolean(authAttempt && isAuthAttemptActive(authAttempt.status)),
    queryFn: () => dashboardSource.getNeteaseAuthAttempt(authAttempt!.attemptId),
    queryKey: ["netease-auth-attempt", authAttempt?.attemptId, dashboardSource.kind],
    refetchInterval: (query) =>
      query.state.data && isAuthAttemptActive(query.state.data.status) ? 750 : false,
    retry: false
  });
  const liveAttempt = latestAuthAttempt(authAttempt, attemptQuery.data);
  const startQrMutation = useMutation({
    mutationFn: () => dashboardSource.startNeteaseQrAuth(),
    onError: () => setAuthError("扫码登录暂时无法启动，请稍后重试或使用手动 MUSIC_U。"),
    onSuccess: (attempt) => {
      setAuthError(null);
      setAuthAttempt(attempt);
      setAuthMethod(attempt.method === "qr" ? "qr" : "sms");
    }
  });
  const startSmsMutation = useMutation({
    mutationFn: () => dashboardSource.startNeteaseSmsAuth(phone, countryCode),
    onError: () => setAuthError("验证码发送失败；请检查号码、频率限制或 Provider 风控。"),
    onSuccess: (attempt) => {
      setAuthError(null);
      setPhone("");
      setAuthAttempt(attempt);
      setAuthMethod(attempt.method === "qr" ? "qr" : "sms");
    }
  });
  const verifySmsMutation = useMutation({
    mutationFn: (input: { readonly attemptId: string; readonly code: string }) =>
      dashboardSource.verifyNeteaseSmsAuth(input.attemptId, input.code),
    onError: () => setAuthError("验证码校验失败；敏感输入已清空，请重新开始登录。"),
    onSuccess: (attempt) => {
      setAuthError(null);
      setAuthAttempt(attempt);
    }
  });
  const cancelAuthMutation = useMutation({
    mutationFn: (attemptId: string) => dashboardSource.cancelNeteaseAuthAttempt(attemptId),
    onError: () => setAuthError("登录正在完成关键步骤，当前无法取消，请稍后查看结果。"),
    onSuccess: () => {
      completedAttempt.current = null;
      setAuthAttempt(null);
      setAuthError(null);
    }
  });

  useEffect(() => {
    if (liveAttempt?.status === "connected" && completedAttempt.current !== liveAttempt.attemptId) {
      completedAttempt.current = liveAttempt.attemptId;
      props.onAuthConnected();
    }
  }, [liveAttempt, props]);

  const showCredentialForm =
    !props.connection?.configured ||
    (reconnecting && !props.validationJob && liveAttempt?.status !== "connected");
  return (
    <section className="glass-surface rounded-[26px] p-5">
      <div className="flex items-center gap-3">
        <CloudArrowUp aria-hidden className="text-blue-600" size={22} weight="duotone" />
        <div>
          <h2 className="text-base font-extrabold text-ink">Provider & Sync</h2>
          <p className="text-[10px] text-ink-muted">真实 Connector 连接只在 Settings 管理</p>
        </div>
      </div>

      {props.loading ? (
        <div className="mt-4 h-28 animate-pulse rounded-2xl bg-white/45" />
      ) : !props.owner ? (
        <div className="mt-4 rounded-2xl border border-white/80 bg-white/50 p-4">
          <GithubLogo aria-hidden className="text-blue-600" size={24} weight="duotone" />
          <p className="mt-3 text-xs font-extrabold text-ink">
            {props.authenticated ? "当前身份不是 Owner" : "Owner authentication required"}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">
            {props.authenticated
              ? "此 GitHub 数字身份不匹配部署配置中的 Owner；所有 /v1/me 写入仍会返回 403。"
              : "Provider 凭据属于 Owner 私有资源。GitHub 仅用于确认稳定身份，不会作为 Nivalis Session Token。"}
          </p>
          {!props.authenticated ? (
            <button
              className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-[11px] font-extrabold text-white disabled:opacity-50"
              disabled={props.pending}
              onClick={props.onLogin}
              type="button"
            >
              使用 GitHub 登录
            </button>
          ) : null}
        </div>
      ) : props.sourceKind === "mock" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-xs font-extrabold text-amber-900">当前为 Mock Mode</p>
          <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
            扫码、短信验证码和 MUSIC_U 写入已停用。Mock Source
            不会访问网易云，也不会再模拟登录成功。
          </p>
          <div className="mt-3 rounded-xl bg-white/70 p-3 text-[9px] leading-relaxed text-ink-muted">
            <code className="block">NEXT_PUBLIC_DASHBOARD_SOURCE=api</code>
            <code className="block">NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001</code>
            <span className="mt-1 block">
              配置 PostgreSQL、OAuth 与 Master Key 后运行 pnpm dev。
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/80 bg-white/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500 text-white">
                <MusicNotes aria-hidden size={21} weight="duotone" />
              </span>
              <div>
                <p className="text-xs font-extrabold text-ink">网易云音乐</p>
                <p className="mt-0.5 text-[10px] text-ink-muted">
                  {props.connection?.displayName ?? "只读 MUSIC_U 连接"}
                </p>
              </div>
            </div>
            <span className={statusClass(status)}>{statusLabel(status)}</span>
          </div>

          {!showCredentialForm ? (
            <div className="mt-4 space-y-3">
              <dl className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-xl bg-white/60 p-3">
                  <dt className="text-ink-muted">最近验证</dt>
                  <dd className="mt-1 font-bold text-ink">
                    {formatTimestamp(props.connection.lastValidatedAt)}
                  </dd>
                </div>
                <div className="rounded-xl bg-white/60 p-3">
                  <dt className="text-ink-muted">验证任务</dt>
                  <dd className="mt-1 font-bold text-ink">
                    {props.validationJob ? syncLabel(props.validationJob.status) : "—"}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <button
                  className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-extrabold text-white disabled:opacity-50"
                  disabled={props.pending}
                  onClick={() => {
                    props.onBeginReconnect();
                    completedAttempt.current = null;
                    setAuthAttempt(null);
                    setAuthError(null);
                    setReconnecting(true);
                  }}
                  type="button"
                >
                  重新连接
                </button>
                <button
                  className="flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10px] font-extrabold text-rose-600 disabled:opacity-50"
                  disabled={props.pending}
                  onClick={props.onDisconnect}
                  type="button"
                >
                  <LinkBreak aria-hidden size={14} weight="bold" />
                  断开并删除凭据
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/55 p-1" role="tablist">
                {(
                  [
                    ["qr", "扫码登录"],
                    ["sms", "验证码"],
                    ["manual", "手动 Cookie"]
                  ] as const
                ).map(([method, label]) => (
                  <button
                    aria-selected={authMethod === method}
                    className={
                      authMethod === method
                        ? "rounded-lg bg-blue-600 px-2 py-2 text-[9px] font-extrabold text-white"
                        : "rounded-lg px-2 py-2 text-[9px] font-bold text-ink-muted"
                    }
                    key={method}
                    onClick={() => setAuthMethod(method)}
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {authMethod === "qr" ? (
                <div className="mt-3 text-center">
                  {liveAttempt?.method === "qr" && liveAttempt.qrUrl ? (
                    <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm">
                      <QRCodeSVG
                        aria-label="网易云登录二维码"
                        bgColor="#ffffff"
                        fgColor="#0a347c"
                        level="M"
                        size={148}
                        value={liveAttempt.qrUrl}
                      />
                    </div>
                  ) : null}
                  <p className="mt-3 text-[10px] font-extrabold text-ink">
                    {liveAttempt?.method === "qr"
                      ? authAttemptStatusLabel(liveAttempt.status)
                      : "使用网易云音乐 App 扫码，Nivalis 不接触账号密码"}
                  </p>
                  <p className="mt-1 text-[9px] leading-relaxed text-ink-muted">
                    二维码状态只由 Worker 轮询；成功后仅提取 MUSIC_U 并加密保存。
                  </p>
                  {!liveAttempt ||
                  liveAttempt.method !== "qr" ||
                  ["expired", "failed"].includes(liveAttempt.status) ? (
                    <button
                      className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-[11px] font-extrabold text-white disabled:opacity-50"
                      disabled={startQrMutation.isPending}
                      onClick={() => {
                        completedAttempt.current = null;
                        setAuthAttempt(null);
                        startQrMutation.mutate();
                      }}
                      type="button"
                    >
                      {startQrMutation.isPending ? "正在创建…" : "生成登录二维码"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {authMethod === "sms" ? (
                <div className="mt-3">
                  {liveAttempt?.method === "sms_otp" &&
                  liveAttempt.status === "waiting_for_code" ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const code = smsCode;
                        setSmsCode("");
                        verifySmsMutation.mutate({ attemptId: liveAttempt.attemptId, code });
                      }}
                    >
                      <p className="text-[10px] font-bold text-ink">
                        验证码已发送至 {liveAttempt.maskedPhone}
                      </p>
                      <input
                        autoComplete="one-time-code"
                        className="mt-2 h-10 w-full rounded-xl border border-white bg-white/75 px-3 text-xs text-ink outline-none ring-blue-400 focus:ring-2"
                        inputMode="numeric"
                        maxLength={8}
                        minLength={4}
                        onChange={(event) => setSmsCode(event.target.value.replaceAll(/\D/g, ""))}
                        placeholder="输入短信验证码"
                        required
                        type="text"
                        value={smsCode}
                      />
                      <button
                        className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-[11px] font-extrabold text-white disabled:opacity-50"
                        disabled={verifySmsMutation.isPending || !/^\d{4,8}$/.test(smsCode)}
                        type="submit"
                      >
                        {verifySmsMutation.isPending ? "正在验证…" : "验证并连接"}
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        completedAttempt.current = null;
                        startSmsMutation.mutate();
                      }}
                    >
                      <div className="grid grid-cols-[72px_1fr] gap-2">
                        <label className="text-[9px] font-bold text-ink-muted">
                          国家码
                          <input
                            className="mt-1 h-10 w-full rounded-xl border border-white bg-white/75 px-2 text-xs text-ink"
                            inputMode="numeric"
                            maxLength={4}
                            onChange={(event) =>
                              setCountryCode(event.target.value.replaceAll(/\D/g, ""))
                            }
                            required
                            value={countryCode}
                          />
                        </label>
                        <label className="text-[9px] font-bold text-ink-muted">
                          手机号
                          <input
                            autoComplete="tel"
                            className="mt-1 h-10 w-full rounded-xl border border-white bg-white/75 px-3 text-xs text-ink"
                            inputMode="tel"
                            maxLength={20}
                            onChange={(event) => setPhone(event.target.value.replaceAll(/\D/g, ""))}
                            required
                            type="tel"
                            value={phone}
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-[9px] leading-relaxed text-ink-muted">
                        手机号与验证码仅作为短期 AEAD 密文保存，终态后立即清除。
                      </p>
                      <button
                        className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-[11px] font-extrabold text-white disabled:opacity-50"
                        disabled={
                          startSmsMutation.isPending ||
                          !/^\d{5,20}$/.test(phone) ||
                          !/^\d{1,4}$/.test(countryCode)
                        }
                        type="submit"
                      >
                        {startSmsMutation.isPending ? "正在发送…" : "发送验证码"}
                      </button>
                    </form>
                  )}
                  {liveAttempt?.method === "sms_otp" &&
                  liveAttempt.status !== "waiting_for_code" ? (
                    <p className="mt-2 text-[9px] font-bold text-blue-700">
                      {authAttemptStatusLabel(liveAttempt.status)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {authMethod === "manual" ? (
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    props.onConnect();
                  }}
                >
                  <label className="block text-[10px] font-bold text-ink-muted">
                    MUSIC_U Cookie value
                    <input
                      autoComplete="off"
                      className="mt-2 h-10 w-full rounded-xl border border-white bg-white/75 px-3 text-xs text-ink outline-none ring-blue-400 focus:ring-2"
                      maxLength={4_096}
                      minLength={16}
                      name="netease-music-u"
                      onChange={(event) => props.onCredentialChange(event.target.value)}
                      placeholder="仅粘贴 MUSIC_U 的值"
                      required
                      type="password"
                      value={props.credential}
                    />
                  </label>
                  <p className="mt-2 text-[9px] leading-relaxed text-ink-muted">
                    该值不会被回显；提交后输入框会立即清空。
                  </p>
                  <button
                    className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-[11px] font-extrabold text-white disabled:opacity-50"
                    disabled={props.pending || props.credential.trim().length < 16}
                    type="submit"
                  >
                    {props.connection?.configured ? "加密替换并重新验证" : "加密保存并验证"}
                  </button>
                </form>
              ) : null}

              {authError || attemptQuery.isError ? (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[9px] font-bold text-rose-700">
                  {authError ?? "登录状态暂时无法读取；短期秘密仍保持加密。"}
                </p>
              ) : null}
              {liveAttempt && isAuthAttemptActive(liveAttempt.status) ? (
                <button
                  className="mt-3 text-[9px] font-bold text-rose-600 underline underline-offset-2 disabled:opacity-50"
                  disabled={cancelAuthMutation.isPending || liveAttempt.status === "verifying"}
                  onClick={() => cancelAuthMutation.mutate(liveAttempt.attemptId)}
                  type="button"
                >
                  取消本次登录
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {props.error ? (
        <p className="mt-3 text-[10px] font-bold text-rose-600">Provider 状态暂时无法加载。</p>
      ) : null}
      {props.notice ? (
        <p className="mt-3 rounded-xl bg-blue-50/80 px-3 py-2 text-[10px] font-bold text-blue-700">
          {props.notice}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {["GitHub", "Bangumi", "Steam", "Bilibili"].map((provider) => (
          <div
            className="flex items-center justify-between rounded-xl bg-white/35 px-3 py-2.5"
            key={provider}
          >
            <span className="text-xs font-bold text-ink">{provider}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">
              后续阶段
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status: ProviderConnection["credentialStatus"]) {
  const labels = {
    expired: "已过期",
    invalid: "无效",
    not_configured: "未连接",
    pending_validation: "验证中",
    revoked: "已撤销",
    valid: "已连接"
  } as const;
  return labels[status];
}

function statusClass(status: ProviderConnection["credentialStatus"]) {
  return status === "valid"
    ? "rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-700"
    : status === "pending_validation"
      ? "rounded-full bg-blue-100 px-2 py-1 text-[9px] font-bold text-blue-700"
      : status === "not_configured"
        ? "rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500"
        : "rounded-full bg-rose-100 px-2 py-1 text-[9px] font-bold text-rose-700";
}

function formatTimestamp(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value)
      )
    : "尚未验证";
}

function syncLabel(status: SyncJob["status"]) {
  const labels = {
    completed: "已完成",
    failed: "失败",
    queued: "排队中",
    retrying: "等待重试",
    running: "同步中"
  } as const;
  return labels[status];
}

function isAuthAttemptActive(status: ProviderAuthAttempt["status"]) {
  return !["connected", "expired", "failed"].includes(status);
}

function authAttemptStatusLabel(status: ProviderAuthAttempt["status"]) {
  const labels: Record<ProviderAuthAttempt["status"], string> = {
    connected: "登录成功，正在验证 Provider 数据权限",
    expired: "登录尝试已过期，请重新开始",
    failed: "Provider 拒绝了登录尝试",
    preparing: "Worker 正在准备登录流程",
    queued: "登录任务已排队",
    verifying: "正在验证短信验证码",
    waiting_for_code: "等待输入短信验证码",
    waiting_for_confirmation: "已扫码，请在网易云 App 中确认",
    waiting_for_scan: "等待网易云 App 扫码"
  };
  return labels[status];
}

function latestAuthAttempt(
  local: ProviderAuthAttempt | null,
  remote: ProviderAuthAttempt | undefined
) {
  if (!local) return null;
  if (!remote) return local;
  if (!isAuthAttemptActive(local.status) && isAuthAttemptActive(remote.status)) return local;
  return new Date(remote.updatedAt) >= new Date(local.updatedAt) ? remote : local;
}
