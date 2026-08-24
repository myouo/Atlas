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
  const showArtists = widget.presentationConfig.showArtists !== false;
  const showTrend = widget.presentationConfig.showTrend !== false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-3 border-b border-blue-100/70 pb-3 sm:grid-cols-4">
        <Metric emphasis label="累计听歌" value={metricValue(total, "首")} />
        <Metric emphasis label="本周收听时长" value={metricValue(duration, "分钟")} />
        <Metric
          label="排行播放次数"
          value={
            weekly.availability === "available"
              ? weekly.rankedPlayCount.toLocaleString("zh-CN")
              : "暂不可用"
          }
        />
        <Metric
          label="最近记录"
          value={
            recent.availability === "available"
              ? `${recent.items.length.toLocaleString("zh-CN")} 条`
              : "暂不可用"
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 pt-3 sm:grid-cols-[1.25fr_1fr_1.2fr]">
        <section className="min-w-0 border-blue-100/70 sm:border-r sm:pr-3">
          <p className="text-[10px] font-bold text-ink-muted">本周 Top Tracks</p>
          {weekly.availability === "available" ? (
            <div className="mt-2 space-y-1.5">
              {weekly.topTracks.slice(0, 4).map((entry) => (
                <div
                  className="flex items-center justify-between gap-2"
                  key={entry.track.providerTrackId}
                >
                  <span className="truncate text-[10px] font-semibold text-ink">
                    {entry.track.name}
                  </span>
                  <span className="shrink-0 text-[9px] font-bold text-[#ff3f5d]">
                    {entry.playCount} 次
                  </span>
                </div>
              ))}
              {weekly.topTracks.length === 0 ? <EmptyLabel text="有效空数据集" /> : null}
            </div>
          ) : (
            <UnavailableLabel reason={weekly.reason} />
          )}
        </section>

        <section className="min-w-0 border-blue-100/70 sm:border-r sm:pr-3">
          <p className="text-[10px] font-bold text-ink-muted">
            {showArtists ? "Top Artists" : "Provider Coverage"}
          </p>
          {showArtists && weekly.availability === "available" ? (
            <div className="mt-2 space-y-1.5">
              {weekly.topArtists.slice(0, 4).map((artist) => (
                <div
                  className="flex items-center justify-between gap-2"
                  key={artist.providerArtistId}
                >
                  <span className="truncate text-[10px] font-semibold text-ink">{artist.name}</span>
                  <span className="text-[9px] text-ink-muted">{artist.rankedPlayCount}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[9px] leading-relaxed text-ink-muted">
              Provider 排行仅覆盖返回的 Top Records；不会推测音乐类型或完整历史。
            </p>
          )}
        </section>

        <section className="min-w-0">
          <p className="text-[10px] font-bold text-ink-muted">
            {showTrend ? "收听报告" : "最近播放"}
          </p>
          {showTrend && data.trend.availability === "available" ? (
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
          ) : recent.availability === "available" ? (
            <div className="mt-2 space-y-1.5">
              {recent.items.slice(0, 4).map((item) => (
                <div className="min-w-0" key={`${item.track.providerTrackId}-${item.playedAt}`}>
                  <p className="truncate text-[10px] font-semibold text-ink">{item.track.name}</p>
                  <p className="text-[8px] text-ink-muted">
                    {item.playedAt.slice(5, 16).replace("T", " ")} UTC
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <UnavailableLabel reason={recent.reason} />
          )}
        </section>
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
