import { ArrowUpRight } from "@phosphor-icons/react";
import Image from "next/image";

import { useModuleShellExpansion } from "../../../design-system/module-shell";
import type { WidgetOf } from "../widget-types";
import { presentationSelection, presentationToggle } from "../widget-presentation";
import { NeteaseWebLink } from "./netease-web-link";

const genreColors = ["#ff4f67", "#ff8a55", "#6f7df4", "#d356dd", "#48a6d7"];

function MiniDonut({
  data
}: {
  readonly data: readonly { readonly name: string; readonly share: number }[];
}) {
  const stops = data.map((item, index) => {
    const start =
      data.slice(0, index).reduce((total, candidate) => total + candidate.share, 0) * 100;
    const end = start + item.share * 100;
    return `${genreColors[index % genreColors.length] ?? "#48a6d7"} ${start}% ${end}%`;
  });
  return (
    <div
      aria-label={`音乐类型占比：${data.map((item) => `${item.name} ${Math.round(item.share * 100)}%`).join("，")}`}
      className="relative h-[72px] w-[72px] shrink-0 rounded-full"
      role="img"
      style={{ backgroundImage: `conic-gradient(${stops.join(",")})` }}
    >
      <span className="absolute inset-[13px] rounded-full bg-white/85" />
    </div>
  );
}

function MiniLineChart({
  label,
  points
}: {
  readonly label: string;
  readonly points: readonly { readonly label: string; readonly value: number }[];
}) {
  if (points.length === 0) return null;
  const maximum = Math.max(...points.map((point) => point.value), 1);
  const minimum = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(1, maximum - minimum);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? 50 : 4 + (index / (points.length - 1)) * 92,
    y: 38 - ((point.value - minimum) / range) * 31
  }));
  return (
    <div aria-label={label} className="relative h-full w-full" role="img">
      <svg
        aria-hidden
        className="h-[calc(100%_-_14px)] w-full overflow-visible"
        viewBox="0 0 100 42"
      >
        <line stroke="rgba(85,118,173,0.18)" strokeWidth="0.7" x1="4" x2="96" y1="38" y2="38" />
        <polyline
          fill="none"
          points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke="#ff4661"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {coordinates.map((point) => (
          <circle
            fill="#ff4661"
            key={`${point.label}-${point.value}`}
            r="1.6"
            cx={point.x}
            cy={point.y}
          >
            <title>{`${point.label}: ${point.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[7px] text-ink-muted">
        <span>{points[0]?.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]?.label}</span> : null}
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false
}: Readonly<{ label: string; value: string; emphasis?: boolean }>) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-ink-muted">{label}</p>
      <p
        className={
          emphasis
            ? "mt-1 text-lg font-extrabold text-[#ff3f5d]"
            : "mt-1 text-lg font-extrabold text-ink"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function NeteaseOverviewWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.overview"> }>) {
  if (widget.schemaVersion === 2) return <NeteaseOverviewWidgetV2 widget={widget} />;
  const { data } = widget;

  return (
    <div className="netease-overview-legacy flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-3 border-b border-blue-100/70 pb-3 sm:grid-cols-4">
        <Metric emphasis label="播放总数" value={data.plays.toLocaleString("zh-CN")} />
        <Metric emphasis label="收听时长" value={`${data.minutes.toLocaleString("zh-CN")} 分钟`} />
        <Metric label="日均播放" value={data.dailyAverage.toLocaleString("zh-CN")} />
        <div className="flex items-end justify-end pb-1 text-sm font-extrabold text-emerald-600">
          <ArrowUpRight aria-hidden size={16} weight="bold" />
          {(data.change * 100).toFixed(0)}%
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 pt-3 sm:grid-cols-[0.85fr_1.35fr_1.6fr]">
        <div className="min-w-0 border-blue-100/70 sm:border-r sm:pr-3">
          <p className="text-[10px] font-bold text-ink-muted">最爱歌手</p>
          <div className="mt-3 flex items-start gap-2">
            {data.topArtists.map((artist) => (
              <div className="min-w-0 text-center" key={artist.name}>
                <Image
                  alt={artist.name}
                  className="mx-auto h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm"
                  height={64}
                  src={artist.avatarUrl}
                  width={64}
                />
                <p className="mt-1 max-w-10 truncate text-[8px] font-semibold text-ink-muted">
                  {artist.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 border-blue-100/70 sm:border-r sm:pr-3">
          <p className="text-[10px] font-bold text-ink-muted">Top 音乐类型</p>
          <div className="mt-1 flex h-[92px] items-center gap-1">
            <MiniDonut data={data.genres} />
            <div className="shrink-0 space-y-1">
              {data.genres.map((genre, index) => (
                <div
                  className="flex items-center gap-1 whitespace-nowrap text-[8px] font-medium text-ink-muted"
                  key={genre.name}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: genreColors[index % genreColors.length] ?? "#48a6d7"
                    }}
                  />
                  <span>{genre.name}</span>
                  <span>{Math.round(genre.share * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-[92px] min-w-0">
          <p className="text-[10px] font-bold text-ink-muted">7 天收听趋势</p>
          <div className="mt-1 h-[96px] w-full">
            <MiniLineChart label="7 天收听趋势" points={data.trend} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NeteaseOverviewWidgetV2({
  widget
}: Readonly<{
  widget: Extract<WidgetOf<"music.netease.overview">, { schemaVersion: 2 }>;
}>) {
  const expanded = useModuleShellExpansion();
  const { data } = widget;
  const weekly = data.weeklyListening;
  const recent = data.recentListening;
  const duration = data.listeningDuration;
  const total = data.totalListenCount;
  const showTopTracks = presentationToggle(widget.presentationConfig, "showTopTracks");
  const showArtists = presentationToggle(widget.presentationConfig, "showArtists");
  const detailPanel = presentationSelection(widget.presentationConfig, "detailPanel", "trend", [
    "trend",
    "recent",
    "none"
  ]);
  const configuredListLimit = Number(
    presentationSelection(widget.presentationConfig, "listLimit", "4", ["2", "4", "6"])
  );
  const listLimit = expanded ? Number.POSITIVE_INFINITY : configuredListLimit;
  const metrics = [
    presentationToggle(widget.presentationConfig, "showTotalListenCount") ? (
      <Metric emphasis key="total" label="累计听歌" value={metricValue(total, "首")} />
    ) : null,
    presentationToggle(widget.presentationConfig, "showListeningDuration") ? (
      <Metric emphasis key="duration" label="本周收听时长" value={metricValue(duration, "分钟")} />
    ) : null,
    presentationToggle(widget.presentationConfig, "showRankedPlayCount") ? (
      <Metric
        key="ranked"
        label="排行播放次数"
        value={
          weekly.availability === "available"
            ? weekly.rankedPlayCount.toLocaleString("zh-CN")
            : "暂不可用"
        }
      />
    ) : null,
    presentationToggle(widget.presentationConfig, "showRecentCount") ? (
      <Metric
        key="recent"
        label="最近记录"
        value={
          recent.availability === "available"
            ? `${recent.items.length.toLocaleString("zh-CN")} 条`
            : "暂不可用"
        }
      />
    ) : null
  ].filter(Boolean);
  const detailCount = Number(showTopTracks) + Number(showArtists) + Number(detailPanel !== "none");
  const detailGrid =
    detailCount >= 3
      ? "sm:grid-cols-[1.25fr_1fr_1.2fr]"
      : detailCount === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-1";

  return (
    <div className="netease-overview-v2 flex h-full min-h-0 flex-col">
      {data.account.availability === "available" ? (
        <div className="mb-2 flex justify-end">
          <NeteaseWebLink
            className="inline-flex items-center rounded-full border border-white/75 bg-white/45 px-2.5 py-1 text-[9px] font-bold text-blue-700"
            href={data.account.webUrl}
            label="在网易云查看账号主页"
          >
            网易云主页
          </NeteaseWebLink>
        </div>
      ) : null}
      {metrics.length > 0 ? (
        <div className="netease-overview-metrics grid grid-cols-2 gap-3 border-b border-blue-100/70 pb-3">
          {metrics}
        </div>
      ) : null}

      <div
        className={`netease-overview-details grid min-h-0 flex-1 grid-cols-1 gap-3 pt-3 ${detailGrid}`}
      >
        {showTopTracks ? (
          <section className="min-w-0 border-blue-100/70 sm:border-r sm:pr-3">
            <p className="text-[10px] font-bold text-ink-muted">本周 Top Tracks</p>
            {weekly.availability === "available" ? (
              <div className="mt-2 space-y-1.5">
                {weekly.topTracks.slice(0, listLimit).map((entry) => (
                  <NeteaseWebLink
                    className="flex items-center justify-between gap-2 rounded-lg px-1"
                    href={entry.track.webUrl}
                    key={entry.track.providerTrackId}
                    label={`在网易云打开歌曲 ${entry.track.name}`}
                  >
                    <span className="truncate text-[10px] font-semibold text-ink">
                      {entry.track.name}
                    </span>
                    <span className="shrink-0 text-[9px] font-bold text-[#ff3f5d]">
                      {entry.playCount} 次
                    </span>
                  </NeteaseWebLink>
                ))}
                {weekly.topTracks.length === 0 ? <EmptyLabel text="有效空数据集" /> : null}
              </div>
            ) : (
              <UnavailableLabel reason={weekly.reason} />
            )}
          </section>
        ) : null}

        {showArtists ? (
          <section className="min-w-0 border-blue-100/70 sm:border-r sm:pr-3">
            <p className="text-[10px] font-bold text-ink-muted">Top Artists</p>
            {weekly.availability === "available" ? (
              <div className="mt-2 space-y-1.5">
                {weekly.topArtists.slice(0, listLimit).map((artist) => (
                  <NeteaseWebLink
                    className="flex items-center justify-between gap-2 rounded-lg px-1"
                    href={artist.webUrl}
                    key={artist.providerArtistId}
                    label={`在网易云查看歌手 ${artist.name}`}
                  >
                    <span className="truncate text-[10px] font-semibold text-ink">
                      {artist.name}
                    </span>
                    <span className="text-[9px] text-ink-muted">{artist.rankedPlayCount}</span>
                  </NeteaseWebLink>
                ))}
              </div>
            ) : (
              <UnavailableLabel reason={weekly.reason} />
            )}
          </section>
        ) : null}

        {detailPanel !== "none" ? (
          <section className="min-w-0">
            <p className="text-[10px] font-bold text-ink-muted">
              {detailPanel === "trend" ? "收听报告" : "最近播放"}
            </p>
            {detailPanel === "trend" ? (
              data.trend.availability === "available" ? (
                <div className="mt-1 h-[100px] w-full">
                  <MiniLineChart
                    label="网易云收听报告"
                    points={data.trend.points.map((point) => ({
                      label: point.label,
                      value: point.minutes
                    }))}
                  />
                </div>
              ) : (
                <UnavailableLabel reason={data.trend.reason} />
              )
            ) : recent.availability === "available" ? (
              <div className="mt-2 space-y-1.5">
                {recent.items.slice(0, listLimit).map((item) => (
                  <NeteaseWebLink
                    className="min-w-0 rounded-lg px-1"
                    href={item.track.webUrl}
                    key={`${item.track.providerTrackId}-${item.playedAt}`}
                    label={`在网易云打开歌曲 ${item.track.name}`}
                  >
                    <p className="truncate text-[10px] font-semibold text-ink">{item.track.name}</p>
                    <p className="text-[8px] text-ink-muted">
                      {item.playedAt.slice(5, 16).replace("T", " ")} UTC
                    </p>
                  </NeteaseWebLink>
                ))}
              </div>
            ) : (
              <UnavailableLabel reason={recent.reason} />
            )}
          </section>
        ) : null}
        {detailCount === 0 ? (
          <p className="self-center text-center text-[10px] font-semibold text-ink-muted">
            未选择详情字段
          </p>
        ) : null}
      </div>
    </div>
  );
}

function metricValue(
  metric:
    | { readonly availability: "available"; readonly value: number }
    | { readonly availability: "unavailable" },
  suffix: string
) {
  return metric.availability === "available"
    ? `${metric.value.toLocaleString("zh-CN")} ${suffix}`
    : "暂不可用";
}

function UnavailableLabel({ reason }: Readonly<{ reason: string }>) {
  return <p className="mt-3 text-[9px] font-semibold text-amber-700">数据不可用 · {reason}</p>;
}

function EmptyLabel({ text }: Readonly<{ text: string }>) {
  return <p className="text-[9px] text-ink-muted">{text}</p>;
}
