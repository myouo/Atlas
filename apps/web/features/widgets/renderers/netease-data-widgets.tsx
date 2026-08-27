import {
  ArrowUpRight,
  CalendarDots,
  Crown,
  Headphones,
  Heart,
  Medal,
  MusicNotes,
  Playlist,
  Trophy,
  UserList
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useModuleShellExpansion } from "../../../design-system/module-shell";
import type { WidgetOf } from "../widget-types";
import { presentationSelection, presentationToggle } from "../widget-presentation";
import { NeteaseWebLink, safeNeteaseWebUrl } from "./netease-web-link";

function Artwork({
  label,
  url,
  size = "md"
}: {
  label: string;
  url: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const dimensions =
    size === "lg"
      ? "h-20 w-20 rounded-[22px]"
      : size === "xs"
        ? "h-7 w-7 rounded-lg"
        : size === "sm"
          ? "h-8 w-8 rounded-xl"
          : "h-11 w-11 rounded-2xl";
  return (
    <span
      aria-label={label}
      className={`${dimensions} relative block shrink-0 overflow-hidden border border-white/90 bg-gradient-to-br from-rose-100 to-blue-100 shadow-sm`}
      role="img"
    >
      {url ? <LazyProviderImage url={url} /> : null}
    </span>
  );
}

function LazyProviderImage({ url }: { readonly url: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    return observeProviderArtwork(image, () => setNearViewport(true));
  }, []);
  return (
    // Provider artwork is already normalized. Native lazy loading avoids decoding off-screen cards.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="h-full w-full object-cover"
      decoding="async"
      loading="lazy"
      ref={imageRef}
      referrerPolicy="no-referrer"
      src={nearViewport ? url : undefined}
    />
  );
}

const providerArtworkCallbacks = new Map<Element, () => void>();
let providerArtworkObserver: IntersectionObserver | null = null;

function releaseProviderArtworkObserverWhenIdle() {
  if (providerArtworkCallbacks.size > 0) return;
  providerArtworkObserver?.disconnect();
  providerArtworkObserver = null;
}

function observeProviderArtwork(element: Element, reveal: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    reveal();
    return undefined;
  }
  providerArtworkObserver ??= new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        providerArtworkCallbacks.get(entry.target)?.();
        providerArtworkCallbacks.delete(entry.target);
        observer.unobserve(entry.target);
        releaseProviderArtworkObserverWhenIdle();
      }
    },
    { rootMargin: "160px 0px" }
  );
  providerArtworkCallbacks.set(element, reveal);
  providerArtworkObserver.observe(element);
  return () => {
    providerArtworkCallbacks.delete(element);
    providerArtworkObserver?.unobserve(element);
    releaseProviderArtworkObserverWhenIdle();
  };
}

function Empty({ children }: { children: string }) {
  return (
    <div className="flex h-full min-h-20 items-center justify-center rounded-2xl border border-dashed border-blue-100 bg-white/30 px-4 text-center text-[10px] font-semibold text-ink-muted">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="netease-stat rounded-2xl border border-white/80 bg-white/48 px-3 py-2.5">
      <p className="netease-stat-label text-[9px] font-semibold text-ink-muted">{label}</p>
      <p className="netease-stat-value mt-1 text-base font-black text-ink">{value}</p>
    </div>
  );
}

export function NeteaseIdentityWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.identity"> }>) {
  const { profile, vip, medals, socialStatus } = widget.data;
  const displayName = profile.displayName ?? "网易云用户";
  const counts = [
    profile.followingCount === undefined ? null : ["关注", profile.followingCount],
    profile.followerCount === undefined ? null : ["粉丝", profile.followerCount],
    profile.playlistCount === undefined ? null : ["歌单", profile.playlistCount]
  ].filter((item): item is [string, number] => item !== null);
  return (
    <div className="netease-identity flex h-full min-h-0 flex-col gap-4">
      <NeteaseWebLink
        className="netease-identity-profile flex min-w-0 items-center gap-4 rounded-2xl"
        href={profile.webUrl}
        indicator
        label={`在网易云查看 ${displayName}`}
      >
        {profile.avatarUrl !== undefined ? (
          <div className="netease-identity-avatar relative">
            <Artwork label={`${displayName} 的网易云头像`} size="lg" url={profile.avatarUrl} />
            {profile.avatarDecorationUrl ? (
              <span
                aria-label="网易云头像标识"
                className="absolute -right-2 -bottom-2 h-9 w-9 rounded-full border-2 border-white bg-contain bg-center bg-no-repeat shadow-md"
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(profile.avatarDecorationUrl)})` }}
              />
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {profile.displayName !== undefined ? (
            <p className="truncate text-xl font-black tracking-[-0.03em] text-ink">{displayName}</p>
          ) : null}
          <div className="netease-identity-badges mt-2 flex flex-wrap gap-1.5">
            {profile.level !== undefined && profile.level !== null ? (
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">
                Lv.{profile.level}
              </span>
            ) : null}
            {vip.availability === "available" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-extrabold text-[#e83d5b]">
                <Crown aria-hidden size={12} weight="fill" />
                {vip.active ? `黑胶 VIP ${vip.redVipLevel ?? ""}`.trim() : "未开通 VIP"}
              </span>
            ) : null}
            {socialStatus.availability === "available" ? (
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-700">
                {socialStatus.name}
              </span>
            ) : null}
          </div>
          {profile.signature !== undefined && profile.signature ? (
            <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-ink-muted">
              {profile.signature}
            </p>
          ) : null}
        </div>
      </NeteaseWebLink>
      {counts.length > 0 ? (
        <div className="netease-identity-counts flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rose-100/65 pt-2.5">
          {counts.map(([label, value]) => (
            <span className="netease-identity-count inline-flex items-baseline gap-1.5" key={label}>
              <span className="text-base font-black text-[#ff4668]">
                {value.toLocaleString("zh-CN")}
              </span>
              <span className="text-[9px] font-bold text-ink-muted">{label}</span>
            </span>
          ))}
        </div>
      ) : null}
      {medals.availability === "available" && medals.items.length > 0 ? (
        <div className="netease-identity-medals mt-auto flex items-center gap-2 overflow-hidden">
          <Medal aria-hidden className="shrink-0 text-amber-500" size={18} weight="duotone" />
          {medals.items.map((item) => (
            <span
              className="truncate rounded-full border border-amber-100 bg-amber-50/75 px-2.5 py-1 text-[9px] font-bold text-amber-800"
              key={item.providerMedalCode}
            >
              {item.name}
              {item.worn ? " · 佩戴中" : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NeteaseListeningWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.listening"> }>) {
  const data = widget.data;
  const metrics = [
    data.totalListenCount.availability === "available"
      ? ["累计听歌", `${data.totalListenCount.value.toLocaleString("zh-CN")} 首`]
      : null,
    data.totalListeningDuration.availability === "available"
      ? [
          "累计时长",
          formatDuration(data.totalListeningDuration.value, data.totalListeningDuration.unit)
        ]
      : null
  ].filter((item): item is [string, string] => item !== null);
  if (metrics.length === 0) return <Empty>当前公开范围没有收听指标</Empty>;
  return (
    <div className="netease-listening flex h-full min-h-0 items-center">
      <div className="netease-listening-metrics grid w-full grid-cols-2 gap-2">
        {metrics.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

export function NeteaseListeningCalendarWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.calendar"> }>) {
  const { data } = widget;
  const availableRanges = [
    data.month.availability === "available" ? "month" : null,
    data.week.availability === "available" ? "week" : null
  ].filter((range): range is "month" | "week" => range !== null);
  const [requestedRange, setRequestedRange] = useState<"month" | "week">(
    availableRanges[0] ?? "month"
  );
  const range = availableRanges.includes(requestedRange)
    ? requestedRange
    : (availableRanges[0] ?? "month");
  const selected = range === "month" ? data.month : data.week;

  if (selected.availability !== "available") {
    return <Empty>当前公开范围没有可用的收听日历</Empty>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex rounded-xl border border-white/90 bg-white/55 p-1 shadow-sm">
          {availableRanges.map((candidate) => (
            <button
              aria-pressed={range === candidate}
              className={
                range === candidate
                  ? "rounded-lg bg-[#ff4668] px-3 py-1 text-[9px] font-extrabold text-white shadow-sm"
                  : "rounded-lg px-3 py-1 text-[9px] font-bold text-ink-muted hover:bg-white/75"
              }
              key={candidate}
              onClick={() => setRequestedRange(candidate)}
              type="button"
            >
              {candidate === "month" ? "本月" : "本周"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-right">
          <span className="text-[9px] font-bold text-ink-muted">
            {formatMinutes(selected.totalMinutes)}
          </span>
          {selected.listenDays !== null ? (
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[8px] font-bold text-[#e83d5b]">
              {selected.listenDays} 天
            </span>
          ) : null}
        </div>
      </div>

      <ListeningHeatmap period={range} points={selected.points} />
    </div>
  );
}

function ListeningHeatmap({
  period,
  points
}: {
  readonly period: "month" | "week";
  readonly points: readonly { readonly date: string; readonly minutes: number }[];
}) {
  if (points.length === 0) return <Empty>这是一个有效空日历</Empty>;
  const cells = calendarCells(points);
  const monthLabel = formatCalendarMonth(points[0]!.date);
  const maxPoint = points.reduce((current, point) =>
    point.minutes > current.minutes ? point : current
  );
  const averageMinutes = points.reduce((total, point) => total + point.minutes, 0) / points.length;
  const silentDays = points.filter((point) => point.minutes === 0).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/70 bg-white/30 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[9px] font-extrabold text-ink-muted">
          <CalendarDots aria-hidden size={13} />
          {period === "month" ? monthLabel : "最近一周"}
        </p>
        <div aria-label="听歌时长图例" className="flex items-center gap-1">
          {[0, 30, 90, 180, 300].map((minutes) => (
            <span className={`h-2.5 w-2.5 rounded-[3px] ${heatColor(minutes)}`} key={minutes} />
          ))}
        </div>
      </div>
      <div className="mt-1 grid min-h-0 flex-1 items-center gap-4 sm:grid-cols-[minmax(180px,0.75fr)_minmax(260px,1.25fr)]">
        <div className="flex items-center justify-center gap-2">
          <div className="grid grid-rows-7 gap-1 text-center text-[7px] leading-5 font-bold text-ink-muted/75">
            {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
              <span className="h-5" key={day}>
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 auto-cols-[20px] gap-1">
            {cells.map((cell, index) =>
              cell ? (
                <div
                  aria-label={`${cell.date}，${cell.minutes} 分钟`}
                  className={`group relative h-5 w-5 rounded-[5px] ${heatColor(cell.minutes)} transition hover:-translate-y-0.5 hover:ring-2 hover:ring-white/80`}
                  key={cell.date}
                  role="img"
                  title={`${cell.date} · ${cell.minutes} 分钟`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[6px] font-black text-white/90 drop-shadow-sm">
                    {Number(cell.date.slice(-2))}
                  </span>
                </div>
              ) : (
                <span aria-hidden className="h-5 w-5" key={`empty-${index}`} />
              )
            )}
          </div>
        </div>
        <div className="hidden grid-cols-3 gap-2 sm:grid">
          <CalendarInsight label="日均" value={`${Math.round(averageMinutes)} 分`} />
          <CalendarInsight
            label="最长一天"
            value={formatCalendarDay(maxPoint.date)}
            detail={formatMinutes(maxPoint.minutes)}
          />
          <CalendarInsight label="零记录" value={`${silentDays} 天`} />
        </div>
      </div>
    </div>
  );
}

function CalendarInsight({
  detail,
  label,
  value
}: {
  readonly detail?: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-xl border border-white/75 bg-white/42 px-3 py-3">
      <p className="text-[8px] font-bold text-ink-muted">{label}</p>
      <p className="mt-1 truncate text-[11px] font-black text-ink">{value}</p>
      {detail ? (
        <p className="mt-0.5 truncate text-[8px] font-semibold text-[#e83d5b]">{detail}</p>
      ) : null}
    </div>
  );
}

function calendarCells(
  points: readonly { readonly date: string; readonly minutes: number }[]
): readonly ({ readonly date: string; readonly minutes: number } | null)[] {
  const ordered = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const first = new Date(`${ordered[0]!.date}T00:00:00.000Z`);
  const last = new Date(`${ordered.at(-1)!.date}T00:00:00.000Z`);
  const byDate = new Map(ordered.map((point) => [point.date, point]));
  const days: ({ readonly date: string; readonly minutes: number } | null)[] = [];
  for (let cursor = first.getTime(); cursor <= last.getTime(); cursor += 86_400_000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    days.push(byDate.get(date) ?? null);
  }
  const leading = (first.getUTCDay() + 6) % 7;
  return [...Array<null>(leading).fill(null), ...days];
}

function heatColor(minutes: number) {
  if (minutes <= 0) return "bg-slate-200/75";
  if (minutes <= 30) return "bg-rose-200";
  if (minutes <= 90) return "bg-rose-300";
  if (minutes <= 180) return "bg-[#ff7990]";
  return "bg-[#ef3f60]";
}

function formatCalendarMonth(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric"
  }).format(parsed);
}

function formatCalendarDay(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(parsed);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return hours > 0 ? `${hours} 小时 ${remainder} 分` : `${remainder} 分钟`;
}

export function NeteaseRankingWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.ranking"> }>) {
  const expanded = useModuleShellExpansion();
  if (widget.schemaVersion === 2) return <NeteaseRankingWidgetV2 widget={widget} />;
  const { data } = widget;
  return <RankingBoard expanded={expanded} items={data.items} showPlayCount style="compact" />;
}

function NeteaseRankingWidgetV2({
  widget
}: Readonly<{
  widget: Extract<WidgetOf<"music.netease.ranking">, { schemaVersion: 2 }>;
}>) {
  const { data } = widget;
  const availableRanges = [
    data.week.availability === "available" ? "week" : null,
    data.allTime.availability === "available" ? "all_time" : null
  ].filter((range): range is "all_time" | "week" => range !== null);
  const [requestedRange, setRequestedRange] = useState<"all_time" | "week">(
    availableRanges[0] ?? "week"
  );
  const range = availableRanges.includes(requestedRange)
    ? requestedRange
    : (availableRanges[0] ?? "week");
  const selected = range === "week" ? data.week : data.allTime;
  const style = presentationSelection(widget.presentationConfig, "rankingStyle", "editorial", [
    "editorial",
    "compact"
  ]);
  const expanded = useModuleShellExpansion();
  const completePublicRanking = availableRanges.every((candidate) => {
    const ranking = candidate === "week" ? data.week : data.allTime;
    return ranking.availability === "available" && ranking.items.length >= ranking.totalAvailable;
  });

  if (expanded) {
    return (
      <div className="min-h-full">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-rose-100/70 pb-3">
          <p className="text-xs font-bold text-ink-muted">
            {completePublicRanking ? "完整公开榜单" : "当前公开范围"}
          </p>
          <NeteaseWebLink
            className="inline-flex items-center rounded-full border border-white/80 bg-white/65 px-3 py-1.5 text-[10px] font-bold text-blue-700"
            href={widget.data.webUrl}
            label="在网易云查看听歌榜单"
          >
            网易云榜单
          </NeteaseWebLink>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {availableRanges.map((candidate) => {
            const ranking = candidate === "week" ? data.week : data.allTime;
            if (ranking.availability !== "available") return null;
            return (
              <section
                className="rounded-[20px] border border-white/80 bg-white/42 p-3 sm:p-4"
                key={candidate}
              >
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-black text-ink">
                    {candidate === "week" ? "最近一周" : "全部时间"}
                  </h3>
                  <span className="text-[9px] font-bold text-ink-muted">
                    {ranking.items.length} / {ranking.totalAvailable}
                  </span>
                </div>
                <RankingBoard
                  expanded
                  items={ranking.items}
                  showPlayCount={presentationToggle(widget.presentationConfig, "showPlayCount")}
                  style="compact"
                />
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="netease-ranking-toolbar mb-2 flex items-center gap-1.5">
        <div className="netease-ranking-tabs inline-flex shrink-0 rounded-xl border border-white/90 bg-white/55 p-1 shadow-sm">
          {availableRanges.map((candidate) => (
            <button
              aria-pressed={range === candidate}
              className={
                range === candidate
                  ? "rounded-lg bg-[#ff4668] px-3 py-1.5 text-[10px] font-extrabold whitespace-nowrap text-white shadow-sm transition"
                  : "rounded-lg px-3 py-1.5 text-[10px] font-bold whitespace-nowrap text-ink-muted transition hover:bg-white/75"
              }
              key={candidate}
              onClick={() => setRequestedRange(candidate)}
              type="button"
            >
              {candidate === "week" ? "最近一周" : "全部时间"}
            </button>
          ))}
        </div>
        {selected.availability === "available" ? (
          <span className="netease-ranking-meta ml-auto shrink-0 text-[8px] font-bold text-ink-muted">
            {selected.items.length}/{selected.totalAvailable}
          </span>
        ) : null}
        <NeteaseWebLink
          className="netease-ranking-web-link flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/60 text-blue-700 shadow-sm"
          href={widget.data.webUrl}
          label="在网易云查看听歌榜单"
        >
          <ArrowUpRight aria-hidden size={12} weight="bold" />
        </NeteaseWebLink>
      </div>

      {selected.availability === "available" ? (
        <RankingBoard
          expanded={false}
          key={range}
          items={selected.items}
          showPlayCount={presentationToggle(widget.presentationConfig, "showPlayCount")}
          style={style}
        />
      ) : (
        <Empty>当前榜单未加入公开范围</Empty>
      )}
    </div>
  );
}

interface RankingEntry {
  readonly playCount: number;
  readonly rank: number;
  readonly score: number;
  readonly track: {
    readonly artists: readonly { readonly name: string }[];
    readonly coverUrl: string | null;
    readonly name: string;
    readonly providerTrackId: string;
    readonly webUrl: string | null;
  };
}

function RankingBoard({
  expanded,
  items,
  showPlayCount,
  style
}: {
  readonly expanded: boolean;
  readonly items: readonly RankingEntry[];
  readonly showPlayCount: boolean;
  readonly style: string;
}) {
  if (items.length === 0) return <Empty>这是一个有效空榜单</Empty>;
  const visible = expanded ? items : items.slice(0, style === "compact" ? 8 : 6);
  return (
    <div
      className={
        expanded
          ? "grid min-h-0 content-start gap-1.5 md:grid-cols-2"
          : "netease-ranking-list grid min-h-0 content-start gap-1"
      }
    >
      {visible.map((item) => (
        <RankingRow item={item} key={item.track.providerTrackId} showPlayCount={showPlayCount} />
      ))}
    </div>
  );
}

function RankingRow({ item, showPlayCount }: { item: RankingEntry; showPlayCount: boolean }) {
  return (
    <NeteaseWebLink
      className={
        item.rank <= 3
          ? "group flex min-w-0 items-center gap-2 rounded-xl border border-rose-100/80 bg-gradient-to-r from-rose-50/80 to-white/50 px-2 py-1.5 transition hover:border-white hover:bg-white/75"
          : "group flex min-w-0 items-center gap-2 rounded-xl border border-transparent bg-white/34 px-2 py-1.5 transition hover:border-white/90 hover:bg-white/65"
      }
      href={item.track.webUrl}
      label={`在网易云打开歌曲 ${item.track.name}`}
    >
      <span
        className={
          item.rank === 1
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-[9px] font-black text-white shadow-sm"
            : item.rank <= 3
              ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#ff6a82] text-[9px] font-black text-white"
              : "w-6 shrink-0 text-center text-[9px] font-black text-blue-500"
        }
      >
        {item.rank === 1 ? <Trophy aria-hidden size={11} weight="fill" /> : item.rank}
      </span>
      <Artwork label={item.track.name} size="xs" url={item.track.coverUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] leading-tight font-extrabold text-ink">
          {item.track.name}
        </p>
        <p className="mt-0.5 truncate text-[8px] leading-tight text-ink-muted">
          {item.track.artists.map((artist) => artist.name).join(" / ")}
        </p>
      </div>
      {showPlayCount ? (
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[8px] font-black text-[#e83d5b]">
          {item.playCount} 次
        </span>
      ) : null}
    </NeteaseWebLink>
  );
}

export function NeteaseSocialWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.social"> }>) {
  const data = widget.data;
  const following = [
    "关注",
    data.followingCount,
    data.following,
    data.followingWebUrl,
    UserList
  ] as const;
  const followers = [
    "粉丝",
    data.followerCount,
    data.followers,
    data.followersWebUrl,
    Heart
  ] as const;
  const sections =
    data.view === "following"
      ? [following]
      : data.view === "followers"
        ? [followers]
        : [following, followers];
  return (
    <div className="netease-social flex h-full min-h-0 flex-col">
      {sections.map(([label, count, , webUrl]) => (
        <NeteaseWebLink
          className="netease-social-entry flex items-end justify-between gap-4 border-b border-rose-100/70 px-1 pb-3"
          href={webUrl}
          key={label}
          label={`在网易云查看${label}`}
        >
          <span>
            <span className="block text-[10px] font-bold tracking-[0.08em] text-[#e83d5b]">
              {label}
            </span>
            <span className="mt-1 block text-[28px] leading-none font-black tracking-[-0.04em] text-[#ff4668]">
              {count.toLocaleString("zh-CN")}
            </span>
          </span>
          <span className="pb-0.5 text-[9px] font-bold text-[#e83d5b]">查看网易云 {label} →</span>
        </NeteaseWebLink>
      ))}
      <div
        className={
          sections.length === 1
            ? "mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3"
            : "mt-3 grid min-h-0 flex-1 gap-3 sm:grid-cols-2"
        }
      >
        {sections.map(([label, , list, , Icon]) =>
          list.availability === "available" ? (
            <section className="min-h-0 overflow-y-auto" key={label}>
              <p className="mb-2 flex items-center gap-1 text-[9px] font-bold text-ink-muted">
                <Icon aria-hidden size={13} />
                {label}列表
              </p>
              <div className="space-y-1.5">
                {list.items.map((person) => (
                  <NeteaseWebLink
                    className="flex items-center gap-2 rounded-xl p-1"
                    href={person.webUrl}
                    key={person.providerUserId}
                    label={`在网易云查看用户 ${person.displayName}`}
                  >
                    <Artwork label={person.displayName} size="sm" url={person.avatarUrl} />
                    <span className="truncate text-[10px] font-bold text-ink">
                      {person.displayName}
                    </span>
                  </NeteaseWebLink>
                ))}
              </div>
            </section>
          ) : null
        )}
      </div>
    </div>
  );
}

export function NeteasePlaylistsWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.playlists"> }>) {
  const expanded = useModuleShellExpansion();
  const { data } = widget;
  if (data.items.length === 0) return <Empty>没有公开歌单，或歌单数据尚未同步</Empty>;
  return (
    <div className="flex min-h-0 flex-col">
      {expanded ? (
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-rose-100/70 pb-3">
          <p className="text-xs font-bold text-ink-muted">
            {data.providerTotal === null || data.items.length >= data.providerTotal
              ? "全部创建歌单"
              : "当前公开歌单"}
          </p>
          <span className="text-[9px] font-bold text-ink-muted">
            {data.items.length}
            {data.providerTotal === null ? "" : ` / ${data.providerTotal}`}
          </span>
        </div>
      ) : null}
      <div
        className={
          expanded
            ? "grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "netease-playlists grid h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto"
        }
      >
        {data.items.map((item) => (
          <NeteaseWebLink
            className="netease-playlist-item flex min-w-0 items-center gap-3 rounded-2xl bg-white/42 p-2.5"
            href={item.webUrl}
            indicator
            key={item.providerPlaylistId}
            label={`在网易云打开歌单 ${item.name}`}
          >
            <Artwork label={item.name} url={item.coverUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-ink">{item.name}</p>
              <p className="mt-1 text-[8px] text-ink-muted">
                {item.trackCount} 首 · {item.playCount.toLocaleString("zh-CN")} 播放
              </p>
            </div>
          </NeteaseWebLink>
        ))}
      </div>
    </div>
  );
}

export function NeteaseShowcaseWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.showcase"> }>) {
  if (widget.schemaVersion === 2) return <NeteaseShowcaseGallery widget={widget} />;
  return <LegacyNeteaseShowcase widget={widget} />;
}

function LegacyNeteaseShowcase({
  widget
}: Readonly<{
  widget: Extract<WidgetOf<"music.netease.showcase">, { schemaVersion: 1 }>;
}>) {
  const card = objectValue(widget.data.card);
  if (widget.data.availability !== "available" || !card)
    return <Empty>所选音乐名片资源暂不可用</Empty>;
  const track = objectValue(card.track);
  const title =
    stringValue(track?.name) ?? stringValue(card.name) ?? stringValue(card.title) ?? "音乐名片";
  const cover =
    stringValue(track?.coverUrl) ?? stringValue(card.coverUrl) ?? stringValue(card.iconUrl);
  const artists = Array.isArray(track?.artists)
    ? track.artists
        .flatMap((artist) => objectValue(artist)?.name ?? [])
        .filter((name): name is string => typeof name === "string")
    : [];
  return (
    <div className="flex h-full min-h-0 items-center gap-5 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#fff1f4]/90 via-white/45 to-[#e7f1ff]/80 p-4">
      <Artwork label={title} size="lg" url={cover ?? null} />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-extrabold tracking-[0.16em] text-[#ff4668] uppercase">
          Netease Showcase
        </p>
        <h3 className="mt-2 truncate text-xl font-black tracking-[-0.03em] text-ink">{title}</h3>
        {artists.length > 0 ? (
          <p className="mt-1 truncate text-[10px] font-semibold text-ink-muted">
            {artists.join(" / ")}
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-2 text-[9px] font-bold text-ink-muted">
          {card.kind === "playlist" ? (
            <Playlist aria-hidden size={15} />
          ) : card.kind === "medal" ? (
            <Medal aria-hidden size={15} />
          ) : (
            <MusicNotes aria-hidden size={15} />
          )}
          {stringValue(card.kind) ?? widget.data.source}
          {typeof card.playCount === "number" ? ` · ${card.playCount} 次` : ""}
        </div>
      </div>
      <Headphones aria-hidden className="shrink-0 text-[#ff4668]/25" size={52} weight="duotone" />
    </div>
  );
}

function NeteaseShowcaseGallery({
  widget
}: Readonly<{
  widget: Extract<WidgetOf<"music.netease.showcase">, { schemaVersion: 2 }>;
}>) {
  const items = widget.data.items;
  if (items.length === 0) {
    const providerMode = widget.data.mode === "provider";
    const providerUnavailable = providerMode && widget.data.availability === "unavailable";
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-[22px] border border-dashed border-rose-200 bg-gradient-to-br from-rose-50/60 via-white/35 to-blue-50/60 px-6 text-center">
        <MusicNotes aria-hidden className="text-[#ff4668]" size={34} weight="duotone" />
        <p className="mt-3 text-sm font-black text-ink">
          {providerUnavailable
            ? "尚未读取到个人主页音乐卡片"
            : providerMode
              ? "网易云主页展柜为空"
              : "自定义展柜还是空的"}
        </p>
        <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-ink-muted">
          {providerUnavailable
            ? "同步后，Nivalis 会从音乐品味、单曲、专辑架、歌单和橱窗 block 读取真实卡片，不会用听歌历史补位。"
            : providerMode
              ? "网易云当前没有返回公开卡片；可以在网易云 App 装扮主页，或切换到 Nivalis 自定义。"
              : "在卡片设置中加入 1～6 个歌曲、歌单、徽章或听歌数据。"}
        </p>
      </div>
    );
  }
  const style = presentationSelection(widget.presentationConfig, "galleryStyle", "editorial", [
    "editorial",
    "compact"
  ]);
  const grid =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";
  return (
    <div className={`grid h-full min-h-0 auto-rows-fr gap-2.5 overflow-hidden ${grid}`}>
      {items.map((item, index) => (
        <ShowcaseTile
          card={objectValue(item.card) ?? {}}
          dense={items.length >= 4}
          editorial={style === "editorial"}
          index={index}
          key={`${item.source}:${item.resourceId}`}
          showMeta={presentationToggle(widget.presentationConfig, "showMeta")}
          source={item.source}
        />
      ))}
    </div>
  );
}

function ShowcaseTile({
  card,
  dense,
  editorial,
  index,
  showMeta,
  source
}: {
  readonly card: Record<string, unknown>;
  readonly dense: boolean;
  readonly editorial: boolean;
  readonly index: number;
  readonly showMeta: boolean;
  readonly source: string;
}) {
  const summary = showcaseSummary(card, source);
  if (dense) {
    const tile = (
      <article
        className={
          editorial
            ? "group relative flex h-full min-h-0 items-center gap-2.5 overflow-hidden rounded-[18px] border border-white/85 bg-gradient-to-br from-white/80 via-white/58 to-rose-50/75 p-2.5 pr-9 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md"
            : "group relative flex h-full min-h-0 items-center gap-2.5 overflow-hidden rounded-2xl border border-white/75 bg-white/48 p-2.5 pr-9 transition duration-300 hover:bg-white/68"
        }
      >
        <ShowcaseArtwork summary={summary} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-[10px] font-black text-ink">
            <span className="truncate">{summary.title}</span>
            {summary.jumpUrl ? (
              <ArrowUpRight
                aria-hidden
                className="shrink-0 text-[#e83d5b]/65 transition group-hover:text-[#e83d5b]"
                size={10}
                weight="bold"
              />
            ) : null}
          </p>
          {summary.subtitle ? (
            <p className="mt-0.5 truncate text-[8px] font-medium text-ink-muted">
              {summary.subtitle}
            </p>
          ) : null}
          {showMeta && summary.meta ? (
            <p className="mt-1 truncate text-[8px] font-bold text-[#e83d5b]">{summary.meta}</p>
          ) : null}
        </div>
        <span className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-white/85 px-1.5 text-[9px] font-black text-[#e83d5b] shadow-sm">
          {index + 1}
        </span>
      </article>
    );
    return <ShowcaseTileLink summary={summary}>{tile}</ShowcaseTileLink>;
  }
  const tile = (
    <article
      className={
        editorial
          ? "group relative flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-white/85 bg-gradient-to-br from-white/80 via-white/58 to-rose-50/75 p-3 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md"
          : "group relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/75 bg-white/48 p-2.5 transition duration-300 hover:bg-white/68"
      }
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <ShowcaseArtwork summary={summary} size={editorial ? "md" : "sm"} />
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/80 px-1.5 text-[9px] font-black text-[#e83d5b] shadow-sm">
          {index + 1}
        </span>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        <p className="flex items-start gap-1 text-[11px] leading-snug font-black text-ink">
          <span className="line-clamp-2">{summary.title}</span>
          {summary.jumpUrl ? (
            <ArrowUpRight
              aria-hidden
              className="mt-0.5 shrink-0 text-[#e83d5b]/65 transition group-hover:text-[#e83d5b]"
              size={11}
              weight="bold"
            />
          ) : null}
        </p>
        {summary.subtitle ? (
          <p className="mt-1 truncate text-[8px] font-medium text-ink-muted">{summary.subtitle}</p>
        ) : null}
        {showMeta && summary.meta ? (
          <p className="mt-1.5 text-[8px] font-bold text-[#e83d5b]">{summary.meta}</p>
        ) : null}
      </div>
    </article>
  );
  return <ShowcaseTileLink summary={summary}>{tile}</ShowcaseTileLink>;
}

function ShowcaseTileLink({
  children,
  summary
}: {
  readonly children: ReactNode;
  readonly summary: ReturnType<typeof showcaseSummary>;
}) {
  if (!summary.jumpUrl) return children;
  const external = summary.jumpUrl.startsWith("https:");
  return (
    <a
      aria-label={`打开 ${summary.title}`}
      className="showcase-tile-link block h-full min-h-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-blue-400/45"
      href={summary.jumpUrl}
      {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
    >
      {children}
    </a>
  );
}

function ShowcaseArtwork({
  size,
  summary
}: {
  readonly size: "sm" | "md";
  readonly summary: ReturnType<typeof showcaseSummary>;
}) {
  if (summary.imageUrls.length > 1) {
    return (
      <span
        aria-label={`${summary.title} 的图片组合`}
        className={
          size === "sm"
            ? "flex h-9 w-12 shrink-0 items-center -space-x-4"
            : "flex h-11 w-14 shrink-0 items-center -space-x-4"
        }
        role="img"
      >
        {summary.imageUrls.slice(0, 3).map((url, index) => (
          <span
            className={`relative block shrink-0 overflow-hidden border border-white bg-gradient-to-br from-rose-100 to-blue-100 shadow-sm ${
              size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
            }`}
            key={`${url}-${index}`}
            style={{ zIndex: index }}
          >
            <LazyProviderImage url={url} />
          </span>
        ))}
      </span>
    );
  }
  if (summary.coverUrl) return <Artwork label={summary.title} size={size} url={summary.coverUrl} />;
  const dimensions = size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";
  return (
    <span
      className={`${dimensions} flex shrink-0 items-center justify-center bg-gradient-to-br from-[#ff6b80] to-[#758cff] text-white shadow-sm`}
    >
      {summary.kind === "duration" ? (
        <Headphones aria-hidden size={size === "sm" ? 18 : 22} weight="duotone" />
      ) : summary.kind === "medal" ? (
        <Medal aria-hidden size={size === "sm" ? 18 : 22} weight="duotone" />
      ) : (
        <MusicNotes aria-hidden size={size === "sm" ? 18 : 22} weight="duotone" />
      )}
    </span>
  );
}

function showcaseSummary(card: Record<string, unknown>, source: string) {
  const jumpUrl = safeNeteaseWebUrl(card.jumpUrl);
  const track = objectValue(card.track);
  if (track) {
    const artists = Array.isArray(track.artists)
      ? track.artists.flatMap((artist) => stringValue(objectValue(artist)?.name) ?? [])
      : [];
    return {
      coverUrl: stringValue(track.coverUrl),
      imageUrls: stringValue(track.coverUrl) ? [stringValue(track.coverUrl)!] : [],
      jumpUrl,
      kind: "track",
      meta: typeof card.playCount === "number" ? `${card.playCount} 次播放` : null,
      subtitle: artists.join(" / "),
      title: stringValue(track.name) ?? "未命名歌曲"
    };
  }
  if (card.kind === "playlist") {
    return {
      coverUrl: stringValue(card.coverUrl),
      imageUrls: stringValue(card.coverUrl) ? [stringValue(card.coverUrl)!] : [],
      jumpUrl,
      kind: "playlist",
      meta: typeof card.trackCount === "number" ? `${card.trackCount} 首歌曲` : null,
      subtitle: Array.isArray(card.tags)
        ? card.tags.filter((tag): tag is string => typeof tag === "string").join(" · ")
        : null,
      title: stringValue(card.name) ?? "未命名歌单"
    };
  }
  if (card.kind === "medal") {
    return {
      coverUrl: stringValue(card.iconUrl),
      imageUrls: stringValue(card.iconUrl) ? [stringValue(card.iconUrl)!] : [],
      jumpUrl,
      kind: "medal",
      meta: card.worn === true ? "佩戴中" : "已获得",
      subtitle: stringValue(card.description),
      title: stringValue(card.name) ?? "乐迷徽章"
    };
  }
  if (card.kind === "duration") {
    return {
      coverUrl: null,
      imageUrls: [],
      jumpUrl,
      kind: "duration",
      meta:
        typeof card.value === "number"
          ? formatDuration(card.value, card.unit === "minutes" ? "minutes" : "seconds")
          : null,
      subtitle: "Provider Reported",
      title: stringValue(card.label) ?? "累计播放时间"
    };
  }
  const resourceType = stringValue(card.resourceType);
  const artists = Array.isArray(card.artists)
    ? card.artists.flatMap((artist) => stringValue(objectValue(artist)?.name) ?? [])
    : [];
  return {
    coverUrl:
      stringValue(card.coverUrl) ??
      (Array.isArray(card.imageUrls) ? stringValue(card.imageUrls[0]) : null),
    kind: stringValue(card.cardKind) ?? source,
    imageUrls: Array.isArray(card.imageUrls)
      ? card.imageUrls.filter((url): url is string => typeof url === "string").slice(0, 3)
      : [],
    jumpUrl,
    meta:
      stringValue(card.badgeText) ??
      (resourceType === "song" || resourceType === "song_rank" ? null : resourceType),
    subtitle:
      resourceType === "song_rank"
        ? null
        : resourceType === "song" && artists.length > 0
          ? artists.join(" / ")
          : (stringValue(card.description) ??
            (Array.isArray(card.textLines)
              ? card.textLines
                  .filter((line): line is string => typeof line === "string")
                  .join(" · ")
              : null)),
    title: stringValue(card.title) || "网易云音乐卡片"
  };
}

function formatDuration(value: number, unit: "plays" | "seconds" | "minutes") {
  if (unit === "seconds") return `${Math.round(value / 3600).toLocaleString("zh-CN")} 小时`;
  if (unit === "minutes") return `${Math.round(value).toLocaleString("zh-CN")} 分钟`;
  return value.toLocaleString("zh-CN");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}
