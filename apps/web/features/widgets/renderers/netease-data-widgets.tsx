import {
  ArrowUpRight,
  CalendarDots,
  CaretLeft,
  CaretRight,
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
  const hasMedals = medals.availability === "available" && medals.items.length > 0;
  return (
    <div
      className={`netease-identity flex h-full min-h-0 flex-col gap-4 ${hasMedals ? "" : "justify-center"}`}
    >
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
      {hasMedals ? (
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
  const expanded = useModuleShellExpansion();
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

  if (expanded) return <ExpandedListeningCalendars data={data} />;

  if (selected.availability !== "available") {
    return <Empty>当前公开范围没有可用的收听日历</Empty>;
  }
  const averageMinutes =
    selected.points.length === 0
      ? 0
      : selected.points.reduce((total, point) => total + point.minutes, 0) / selected.points.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        {availableRanges.length === 2 ? (
          <SlidingSwitcher
            label="收听日历范围"
            onChange={setRequestedRange}
            options={[
              { label: "本月", value: "month" },
              { label: "本周", value: "week" }
            ]}
            value={range}
          />
        ) : (
          <span className="px-1 text-[9px] font-extrabold text-[#e83d5b]">
            {range === "month" ? "本月" : "本周"}
          </span>
        )}
        {range === "month" && selected.points.length > 0 ? (
          <span className="hidden items-center gap-1.5 text-[8px] font-extrabold text-ink-muted sm:inline-flex">
            <CalendarDots aria-hidden size={12} />
            {formatCalendarMonth(selected.points[0]!.date)}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-right">
          <span className="text-[9px] font-bold text-ink-muted">
            {formatMinutes(selected.totalMinutes)}
          </span>
          {selected.listenDays !== null ? (
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[8px] font-bold text-[#e83d5b]">
              {selected.listenDays} 天
            </span>
          ) : null}
          <span className="hidden text-[8px] font-bold text-ink-muted md:inline">
            日均 {Math.round(averageMinutes)} 分
          </span>
          {range === "month" ? (
            <span aria-label="听歌时长图例" className="hidden items-center gap-1 lg:flex">
              {[0, 30, 90, 180, 300].map((minutes) => (
                <span className={`h-2.5 w-2.5 rounded-[3px] ${heatColor(minutes)}`} key={minutes} />
              ))}
            </span>
          ) : null}
        </div>
      </div>

      <div className="netease-range-panel flex min-h-0 flex-1" key={range}>
        <CompactListeningCalendar data={data} range={range} selected={selected} />
      </div>
    </div>
  );
}

type NeteaseCalendarData = WidgetOf<"music.netease.calendar">["data"];
type NeteaseCalendarRange = Extract<
  NeteaseCalendarData["week"],
  { readonly availability: "available" }
>;
type NeteaseRecordWall = Extract<
  NonNullable<NeteaseCalendarRange["recordWall"]>,
  { readonly availability: "available" }
>;

const COMPACT_RECORD_WALL_LIMIT = 20;
const EXPANDED_RECORD_WALL_LIMIT = 20;

function SlidingSwitcher<T extends string>({
  label,
  onChange,
  options,
  value
}: {
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly [
    { readonly label: string; readonly value: T },
    { readonly label: string; readonly value: T }
  ];
  readonly value: T;
}) {
  const activeIndex = options[1].value === value ? 1 : 0;
  return (
    <div
      aria-label={label}
      className="netease-sliding-switcher relative inline-grid shrink-0 grid-cols-2 p-0.5"
      role="group"
    >
      <span
        aria-hidden
        className="netease-sliding-switcher-indicator"
        style={{ transform: `translate3d(${activeIndex * 100}%, 0, 0)` }}
      />
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={
            option.value === value
              ? "relative z-10 rounded-lg px-3 py-1 text-[9px] font-extrabold text-white transition-colors duration-200"
              : "relative z-10 rounded-lg px-3 py-1 text-[9px] font-bold text-ink-muted transition-colors duration-200 hover:text-blue-700"
          }
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CompactListeningCalendar({
  data,
  range,
  selected
}: {
  readonly data: NeteaseCalendarData;
  readonly range: "month" | "week";
  readonly selected: NeteaseCalendarRange;
}) {
  const wall =
    selected.recordWall?.availability === "available" && selected.recordWall.items.length > 0
      ? selected.recordWall
      : null;
  const previousWeek = data.previousWeek?.availability === "available" ? data.previousWeek : null;

  if (range === "week" && !wall && previousWeek) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <WeeklyListeningRhythm compactDates label="上周" points={previousWeek.points} />
        <WeeklyListeningRhythm compactDates label="本周" points={selected.points} />
      </div>
    );
  }

  const calendar =
    range === "month" ? (
      <MonthlyListeningCalendar compact={Boolean(wall)} points={selected.points} />
    ) : (
      <WeeklyListeningRhythm
        compactDates={Boolean(wall)}
        compactHeader={Boolean(wall)}
        points={selected.points}
      />
    );
  if (!wall) return calendar;

  return (
    <div className="netease-calendar-composite grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(116px,0.62fr)] gap-1.5">
      <ListeningRecordWall compact period={range} wall={wall} />
      {calendar}
    </div>
  );
}

function ExpandedListeningCalendars({ data }: { readonly data: NeteaseCalendarData }) {
  const availableRanges = [
    data.week.availability === "available" ? "week" : null,
    data.month.availability === "available" ? "month" : null
  ].filter((range): range is "month" | "week" => range !== null);
  const [requestedRange, setRequestedRange] = useState<"month" | "week">(
    availableRanges[0] ?? "week"
  );
  const range = availableRanges.includes(requestedRange)
    ? requestedRange
    : (availableRanges[0] ?? "week");
  const entries =
    range === "week"
      ? calendarHistoryEntries("week", data.week, data.previousWeek)
      : calendarHistoryEntries("month", data.month, data.previousMonth);
  const [periodIndex, setPeriodIndex] = useState(0);
  const activeIndex = Math.min(periodIndex, Math.max(entries.length - 1, 0));
  const active = entries[activeIndex];

  if (!active) return <Empty>当前公开范围没有可用的收听日历</Empty>;
  const wall =
    active.value.recordWall?.availability === "available" ? active.value.recordWall : null;
  const canGoOlder = activeIndex < entries.length - 1;
  const canGoNewer = activeIndex > 0;
  return (
    <div className="min-h-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100/70 pb-3">
        {availableRanges.length === 2 ? (
          <SlidingSwitcher
            label="收听日历历史范围"
            onChange={(value) => {
              setRequestedRange(value);
              setPeriodIndex(0);
            }}
            options={[
              { label: "周", value: "week" },
              { label: "月", value: "month" }
            ]}
            value={range}
          />
        ) : (
          <span className="text-[10px] font-extrabold text-[#e83d5b]">
            {range === "week" ? "周" : "月"}
          </span>
        )}
        <span className="text-[9px] font-bold text-ink-muted">Provider 历史 · 由新到旧</span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/75 bg-white/38 p-2.5 sm:p-3">
        <button
          aria-label={range === "week" ? "查看更早一周" : "查看更早月份"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-blue-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canGoOlder}
          onClick={() => setPeriodIndex((index) => Math.min(index + 1, entries.length - 1))}
          type="button"
        >
          <CaretLeft aria-hidden size={14} weight="bold" />
        </button>
        <div className="min-w-0 text-center">
          <p className="flex items-center justify-center gap-2 text-[13px] font-black text-ink">
            <span className="truncate">{active.label}</span>
            {active.historical ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[8px] font-bold text-blue-600">
                历史
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[9px] font-bold text-ink-muted">
            {formatMinutes(active.value.totalMinutes)} · {active.value.listenDays ?? 0} 个收听日
          </p>
        </div>
        <button
          aria-label={range === "week" ? "查看更新一周" : "查看更新月份"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-blue-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canGoNewer}
          onClick={() => setPeriodIndex((index) => Math.max(index - 1, 0))}
          type="button"
        >
          <CaretRight aria-hidden size={14} weight="bold" />
        </button>
      </div>

      <div
        className={`netease-range-panel grid min-h-0 items-start gap-4 ${wall ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]" : ""}`}
        key={`${range}:${active.label}`}
      >
        {range === "month" ? (
          <MonthlyListeningCalendar hidePeriodLabel points={active.value.points} />
        ) : (
          <WeeklyListeningRhythm label={active.label} points={active.value.points} />
        )}
        {wall ? <ListeningRecordWall period={range} wall={wall} /> : null}
      </div>
    </div>
  );
}

function calendarHistoryEntries(
  period: "month" | "week",
  current: NeteaseCalendarData["month"] | NeteaseCalendarData["week"],
  previous: NeteaseCalendarData["previousMonth"] | NeteaseCalendarData["previousWeek"]
) {
  const entries: {
    readonly historical: boolean;
    readonly label: string;
    readonly value: NeteaseCalendarRange;
  }[] = [];
  if (current.availability === "available") {
    entries.push({
      historical: false,
      label:
        period === "week"
          ? "本周"
          : current.points[0]
            ? formatCalendarMonth(current.points[0].date)
            : "本月",
      value: current
    });
  }
  if (previous?.availability === "available") {
    entries.push({
      historical: true,
      label: formatCalendarPeriod(previous.points, period),
      value: previous
    });
  }
  return entries;
}

function ListeningRecordWall({
  compact = false,
  period,
  wall
}: {
  readonly compact?: boolean;
  readonly period: "month" | "week";
  readonly wall: NeteaseRecordWall;
}) {
  const items = wall.items.slice(
    0,
    compact ? COMPACT_RECORD_WALL_LIMIT : EXPANDED_RECORD_WALL_LIMIT
  );
  return (
    <div
      className={`flex min-h-0 flex-col rounded-2xl border border-white/70 bg-white/30 ${compact ? "p-1.5" : "p-2"}`}
    >
      <div className={`${compact ? "mb-1" : "mb-1.5"} flex items-center justify-between gap-1`}>
        <p className="flex min-w-0 items-center gap-1 text-[8px] font-extrabold text-ink-muted">
          <MusicNotes aria-hidden size={11} />
          <span className="truncate">
            {compact ? "唱片墙" : period === "week" ? "本周唱片墙" : "本月唱片墙"}
          </span>
        </p>
        <span className="shrink-0 text-[7px] font-bold text-ink-muted">
          {wall.songCount}
          {compact ? "" : " 首"}
        </span>
      </div>
      <div
        className={
          compact
            ? "netease-calendar-wall-grid grid min-h-0 flex-1 overflow-hidden"
            : "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5"
        }
      >
        {items.map((item, index) => (
          <NeteaseWebLink
            className={compact ? "netease-calendar-wall-item group min-w-0" : "group min-w-0"}
            href={item.webUrl}
            key={`${item.coverUrl}:${index}`}
            label={
              item.name
                ? `在网易云打开歌曲 ${item.name}`
                : "网易云唱片墙封面；Provider 未返回歌曲身份"
            }
          >
            <span className="relative block aspect-square overflow-hidden rounded-[10px] border border-white/80 bg-rose-50/55 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
              <LazyProviderImage url={item.coverUrl} />
            </span>
            {!compact ? (
              <span className="mt-1 block truncate text-[8px] font-bold text-ink">
                {item.name ?? item.albumName ?? "仅封面"}
              </span>
            ) : null}
          </NeteaseWebLink>
        ))}
      </div>
    </div>
  );
}

function MonthlyListeningCalendar({
  compact = false,
  hidePeriodLabel = false,
  points
}: {
  readonly compact?: boolean;
  readonly hidePeriodLabel?: boolean;
  readonly points: readonly { readonly date: string; readonly minutes: number }[];
}) {
  if (points.length === 0) return <Empty>这是一个有效空日历</Empty>;
  const cells = calendarCells(points);
  const rowCount = Math.ceil(cells.length / 7);
  const monthLabel = formatCalendarMonth(points[0]!.date);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/30 p-2">
      {!hidePeriodLabel ? (
        <div className="mb-1 flex items-center justify-between gap-2 sm:hidden">
          <p className="flex items-center gap-1.5 text-[8px] font-extrabold text-ink-muted">
            <CalendarDots aria-hidden size={12} />
            {compact ? `${Number(points[0]!.date.slice(5, 7))}月` : monthLabel}
          </p>
          {!compact ? (
            <span aria-label="听歌时长图例" className="flex items-center gap-1">
              {[0, 30, 90, 180, 300].map((minutes) => (
                <span className={`h-2.5 w-2.5 rounded-[3px] ${heatColor(minutes)}`} key={minutes} />
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col">
        <div className="grid grid-cols-7 gap-1 text-center text-[7px] font-bold text-ink-muted/75">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          className="mt-1 grid min-h-0 flex-1 grid-cols-7 gap-1"
          data-calendar-rows={rowCount}
          style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
        >
          {cells.map((cell, index) =>
            cell ? (
              <div
                aria-label={`${cell.date}，${cell.minutes} 分钟`}
                className="group flex min-w-0 items-center justify-center"
                key={cell.date}
                role="img"
                title={`${cell.date} · ${cell.minutes} 分钟`}
              >
                <span
                  className={`monthly-heat-dot flex aspect-square w-full items-center justify-center rounded-full ${compact ? "max-w-[14px]" : "max-w-6"} ${heatColor(cell.minutes)} transition duration-200 group-hover:-translate-y-0.5 group-hover:ring-2 group-hover:ring-white/80`}
                >
                  <span className={`text-[6px] font-black ${heatTextColor(cell.minutes)}`}>
                    {Number(cell.date.slice(-2))}
                  </span>
                </span>
              </div>
            ) : (
              <span aria-hidden className="flex items-center justify-center" key={`empty-${index}`}>
                <span
                  className={`aspect-square w-full rounded-full bg-white/14 ${compact ? "max-w-[14px]" : "max-w-6"}`}
                />
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function WeeklyListeningRhythm({
  compactDates = false,
  compactHeader = false,
  label = "最近一周",
  points
}: {
  readonly compactDates?: boolean;
  readonly compactHeader?: boolean;
  readonly label?: string;
  readonly points: readonly { readonly date: string; readonly minutes: number }[];
}) {
  if (points.length === 0) return <Empty>这是一个有效空周报</Empty>;
  const maximum = Math.max(...points.map((point) => point.minutes), 1);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/30 p-2.5"
      data-weekly-label={label}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[9px] font-extrabold text-ink-muted">
          <CalendarDots aria-hidden size={13} /> {compactHeader ? "周节奏" : label}
        </p>
        <span className="text-[8px] font-bold text-ink-muted">
          {compactHeader ? `${points.length} 日` : `${points.length} 个每日记录`}
        </span>
      </div>
      <div
        className="weekly-rhythm-chart relative grid min-h-0 flex-1 gap-1 px-1"
        data-weekly-rhythm
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((point) => {
          const intensity = point.minutes / maximum;
          const state = rhythmState(point.minutes, intensity);
          const heightPercent = point.minutes === 0 ? 0 : Math.max(8, intensity * 100);
          return (
            <div
              aria-label={`${point.date}，${point.minutes} 分钟`}
              className="weekly-rhythm-day relative z-10 grid min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]"
              data-rhythm-state={state}
              key={point.date}
              role="img"
            >
              {compactHeader ? (
                <span className="whitespace-nowrap text-center text-[6px] font-black tracking-[-0.03em] text-[#e83d5b]">
                  {compactMinutes(point.minutes)}
                </span>
              ) : (
                <>
                  <span className="hidden truncate text-center text-[8px] font-black text-[#e83d5b] sm:block">
                    {formatMinutes(point.minutes)}
                  </span>
                  <span className="truncate text-center text-[8px] font-black text-[#e83d5b] sm:hidden">
                    {compactMinutes(point.minutes)}
                  </span>
                </>
              )}
              <span className="my-1 flex min-h-0 items-end justify-center">
                <span aria-hidden className="weekly-rhythm-track">
                  {point.minutes > 0 ? (
                    <span
                      className="weekly-rhythm-fill"
                      data-rhythm-level={state}
                      style={{ height: `${heightPercent}%` }}
                    />
                  ) : null}
                </span>
              </span>
              <span className="truncate text-center text-[7px] font-bold text-ink-muted">
                {compactDates ? formatWeekday(point.date) : formatWeekDate(point.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rhythmState(minutes: number, intensity: number): "dormant" | "quiet" | "warm" | "peak" {
  if (minutes === 0) return "dormant";
  if (intensity === 1) return "peak";
  if (intensity >= 0.35) return "warm";
  return "quiet";
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    weekday: "short"
  }).format(new Date(`${date}T00:00:00.000Z`));
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

function heatTextColor(minutes: number) {
  return minutes <= 30 ? "text-ink/70" : "text-white";
}

function compactMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1)}h`;
}

function formatCalendarMonth(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric"
  }).format(parsed);
}

function formatCalendarPeriod(
  points: readonly { readonly date: string }[],
  period: "month" | "week"
) {
  if (points.length === 0) return period === "week" ? "历史周" : "历史月";
  const ordered = [...points].sort((left, right) => left.date.localeCompare(right.date));
  if (period === "month") return formatCalendarMonth(ordered[0]!.date);
  const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(-2))}`;
  return `${short(ordered[0]!.date)} – ${short(ordered.at(-1)!.date)}`;
}

function formatWeekDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    weekday: "short"
  }).format(parsed);
  return `${weekday} ${Number(date.slice(5, 7))}/${Number(date.slice(-2))}`;
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
        {availableRanges.length === 2 ? (
          <SlidingSwitcher
            label="听歌榜单范围"
            onChange={setRequestedRange}
            options={[
              { label: "最近一周", value: "week" },
              { label: "全部时间", value: "all_time" }
            ]}
            value={range}
          />
        ) : (
          <span className="px-1 text-[9px] font-extrabold text-[#e83d5b]">
            {range === "week" ? "最近一周" : "全部时间"}
          </span>
        )}
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

      <div className="netease-range-panel min-h-0 flex-1" key={range}>
        {selected.availability === "available" ? (
          <RankingBoard
            expanded={false}
            items={selected.items}
            showPlayCount={presentationToggle(widget.presentationConfig, "showPlayCount")}
            style={style}
          />
        ) : (
          <Empty>当前榜单未加入公开范围</Empty>
        )}
      </div>
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
  const visibleItems = expanded ? data.items : data.items.slice(0, 6);
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
            : "netease-playlists grid h-full min-h-0 grid-cols-1 content-start gap-2 overflow-hidden"
        }
      >
        {visibleItems.map((item) => (
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
