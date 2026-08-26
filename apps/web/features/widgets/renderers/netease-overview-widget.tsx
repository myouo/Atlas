import { ArrowUpRight } from "@phosphor-icons/react";
import Image from "next/image";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { WidgetOf } from "../widget-types";
import { presentationSelection, presentationToggle } from "../widget-presentation";
import { NeteaseWebLink } from "./netease-web-link";

const genreColors = ["#ff4f67", "#ff8a55", "#6f7df4", "#d356dd", "#48a6d7"];

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
    <div className="flex h-full min-h-0 flex-col">
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
            <div className="h-[72px] w-[72px] shrink-0" aria-label="音乐类型占比图">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={data.genres}
                    dataKey="share"
                    innerRadius={19}
                    outerRadius={32}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.genres.map((genre, index) => (
                      <Cell
                        fill={genreColors[index % genreColors.length] ?? "#48a6d7"}
                        key={genre.name}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
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
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={data.trend} margin={{ bottom: 0, left: -22, right: 6, top: 10 }}>
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  fontSize={8}
                  tickLine={false}
                  tick={{ fill: "#6a85b5" }}
                />
                <YAxis axisLine={false} fontSize={8} tickLine={false} tick={{ fill: "#6a85b5" }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(255,255,255,0.94)",
                    border: "1px solid rgba(153,188,235,0.7)",
                    borderRadius: 12,
                    color: "#092f78",
                    fontSize: 11
                  }}
                />
                <Line
                  dataKey="value"
                  dot={{ fill: "#ff4661", r: 3, strokeWidth: 0 }}
                  stroke="#ff4661"
                  strokeWidth={2.2}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
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
  const listLimit = Number(
    presentationSelection(widget.presentationConfig, "listLimit", "4", ["2", "4", "6"])
  );
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
    <div className="flex h-full min-h-0 flex-col">
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
        <div className="grid grid-cols-2 gap-3 border-b border-blue-100/70 pb-3 sm:grid-cols-4">
          {metrics}
        </div>
      ) : null}

      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 pt-3 ${detailGrid}`}>
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
                  <ResponsiveContainer height="100%" width="100%">
                    <LineChart
                      data={data.trend.points}
                      margin={{ bottom: 0, left: -24, right: 4, top: 8 }}
                    >
                      <XAxis axisLine={false} dataKey="label" fontSize={8} tickLine={false} />
                      <YAxis axisLine={false} fontSize={8} tickLine={false} />
                      <Line
                        dataKey="minutes"
                        dot={{ fill: "#ff4661", r: 3, strokeWidth: 0 }}
                        stroke="#ff4661"
                        strokeWidth={2.2}
                        type="monotone"
                      />
                    </LineChart>
                  </ResponsiveContainer>
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
