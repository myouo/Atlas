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
