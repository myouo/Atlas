import type { PublishedWidget, SvgCard } from "./svg-renderer";
import {
  array,
  escapeXml,
  fit,
  formatDuration,
  formatNumber,
  initials,
  numeric,
  object,
  periodLabel,
  safeHost,
  string
} from "./svg-utils";

const BACKGROUND = "#15161b";
const SURFACE = "#202127";
const LINE = "#373840";
const INK = "#f5eee3";
const MUTED = "#aaa6a2";
const RED = "#ff6575";

export function renderVinylCard(
  widget: PublishedWidget,
  siteUrl: string,
  options: URLSearchParams
): SvgCard {
  switch (widget.type) {
    case "music.netease.ranking":
      if (widget.schemaVersion === 2) return ranking(widget, siteUrl, options);
      break;
    case "music.netease.identity":
      return identity(widget, siteUrl);
    case "music.netease.playlists":
      return playlists(widget, siteUrl);
    case "music.netease.showcase":
      if (widget.schemaVersion === 2) return showcase(widget, siteUrl);
      break;
    case "music.netease.calendar":
      return calendar(widget, siteUrl, options);
  }
  return card(widget, siteUrl, "MUSIC NOTES", 240, empty("在 About Me 查看完整卡片", 240));
}

function ranking(widget: PublishedWidget, siteUrl: string, options: URLSearchParams) {
  const height = 414;
  const data = object(widget.data);
  const range = publicRange(data, options.get("range") === "all_time" ? "all_time" : "week");
  const selected = range ? object(data?.[range]) : null;
  const items = selected?.availability === "available" ? array(selected.items).slice(0, 6) : [];
  const maximum = Math.max(1, ...items.map((item) => numeric(object(item)?.playCount) ?? 0));
  let markup = type(
    688,
    89,
    range === "all_time" ? "ALL TIME / 全部时间" : "LAST 7 DAYS / 最近一周",
    10,
    RED,
    600,
    "end"
  );
  if (!items.length) markup += empty("当前榜单暂无公开数据", height);
  for (const [index, item] of items.entries()) {
    const row = object(item);
    const track = object(row?.track);
    const count = numeric(row?.playCount);
    const artists = array(track?.artists)
      .map((artist) => string(object(artist)?.name))
      .filter(Boolean);
    const y = 116 + index * 44;
    markup +=
      type(32, y + 22, String(index + 1).padStart(2, "0"), 17, RED, 700) +
      type(82, y + 15, fit(string(track?.name) || "未知曲目", 27), 14, INK, 600) +
      type(82, y + 32, fit(artists.join(" / "), 34), 10, MUTED) +
      type(688, y + 15, count === null ? "" : `${formatNumber(count)} 次`, 11, INK, 500, "end") +
      `<line x1="82" y1="${y + 41}" x2="688" y2="${y + 41}" stroke="${LINE}"/>`;
    if (count !== null) {
      markup +=
        `<rect x="536" y="${y + 26}" width="152" height="4" rx="2" fill="${LINE}"/>` +
        `<rect x="536" y="${y + 26}" width="${Math.max(2, Math.round((count / maximum) * 152))}" height="4" rx="2" fill="${RED}"/>`;
    }
  }
  return card(widget, siteUrl, "ON REPEAT", height, markup);
}

function identity(widget: PublishedWidget, siteUrl: string) {
  const data = object(widget.data);
  const profile = object(data?.profile);
  const vip = object(data?.vip);
  const name = string(profile?.displayName) || "网易云用户";
  let markup =
    record(124, 179, 66) +
    type(124, 185, initials(name), 21, BACKGROUND, 800, "middle") +
    type(236, 144, fit(name, 21), 27, INK, 700) +
    type(
      236,
      169,
      `Lv.${numeric(profile?.level) ?? "—"}${vip?.availability === "available" && vip.active ? `  /  黑胶 VIP ${numeric(vip.redVipLevel) ?? ""}` : ""}`,
      12,
      RED,
      600
    );
  const metrics = [
    ["关注", numeric(profile?.followingCount)],
    ["粉丝", numeric(profile?.followerCount)],
    ["歌单", numeric(profile?.playlistCount)]
  ] as const;
  metrics.forEach(([label, value], index) => {
    const x = 236 + index * 145;
    markup +=
      type(x, 211, value === null ? "—" : formatNumber(value), 27, INK, 600) +
      type(x, 235, label, 11, MUTED);
  });
  return card(widget, siteUrl, "LISTENING ID", 284, markup);
}

function playlists(widget: PublishedWidget, siteUrl: string) {
  const height = 340;
  const items = array(object(widget.data)?.items).slice(0, 4);
  let markup = items.length ? "" : empty("暂无可展示的歌单", height);
  for (const [index, item] of items.entries()) {
    const row = object(item);
    const x = 32 + (index % 2) * 336;
    const y = 115 + Math.floor(index / 2) * 96;
    const tracks = numeric(row?.trackCount);
    const plays = numeric(row?.playCount);
    markup +=
      `<rect x="${x}" y="${y}" width="320" height="82" rx="6" fill="${SURFACE}"/>` +
      record(x + 34, y + 34, 21) +
      type(x + 66, y + 29, fit(string(row?.name) || "未命名歌单", 17), 13, INK, 600) +
      type(
        x + 66,
        y + 50,
        `${tracks === null ? "—" : formatNumber(tracks)} 首 / ${plays === null ? "—" : formatNumber(plays)} 播放`,
        10,
        MUTED
      ) +
      type(x + 16, y + 70, `COLLECTION ${String(index + 1).padStart(2, "0")}`, 8, RED, 600);
  }
  return card(widget, siteUrl, "THE COLLECTION", height, markup);
}

function showcase(widget: PublishedWidget, siteUrl: string) {
  const height = 372;
  const items = array(object(widget.data)?.items).slice(0, 6);
  let markup = items.length ? "" : empty("暂无可展示的音乐名片", height);
  for (const [index, item] of items.entries()) {
    const resource = object(object(item)?.card);
    const title = string(resource?.title) || string(resource?.name) || "音乐名片";
    const subtitle =
      string(resource?.subtitle) ||
      array(resource?.artists)
        .map((artist) => (typeof artist === "string" ? artist : string(object(artist)?.name)))
        .filter(Boolean)
        .join(" / ");
    const x = 32 + (index % 3) * 224;
    const y = 114 + Math.floor(index / 3) * 112;
    markup +=
      `<rect x="${x}" y="${y}" width="208" height="102" rx="6" fill="${SURFACE}" stroke="${LINE}"/>` +
      type(x + 14, y + 23, String(index + 1).padStart(2, "0"), 13, RED, 700) +
      record(x + 164, y + 31, 20) +
      type(x + 14, y + 71, fit(title, 13), 13, INK, 600) +
      type(x + 14, y + 90, fit(subtitle, 21), 9, MUTED);
  }
  return card(widget, siteUrl, "SHELF NOTES", height, markup);
}

function calendar(widget: PublishedWidget, siteUrl: string, options: URLSearchParams) {
  const data = object(widget.data);
  const period = publicRange(data, options.get("period") === "week" ? "week" : "month");
  const height = period === "week" ? 350 : 396;
  const current = period ? object(data?.[period]) : null;
  const points = current?.availability === "available" ? array(current.points) : [];
  const minutes = numeric(current?.totalMinutes);
  let markup = type(
    688,
    89,
    minutes === null ? "暂无公开时长" : formatDuration(minutes),
    12,
    RED,
    600,
    "end"
  );
  if (!points.length)
    return card(
      widget,
      siteUrl,
      "LISTENING JOURNAL",
      height,
      markup + empty("当前公开范围暂无收听记录", height)
    );
  const firstDate = string(object(points[0])?.date);
  markup += type(32, 131, periodLabel(firstDate, period ?? "month"), 15, INK, 600);
  if (period === "week") {
    const maximum = Math.max(
      1,
      ...points.slice(0, 7).map((point) => numeric(object(point)?.minutes) ?? 0)
    );
    points.slice(0, 7).forEach((point, index) => {
      const row = object(point);
      const value = Math.max(0, numeric(row?.minutes) ?? 0);
      const x = 48 + index * 90;
      const bar = Math.round((value / maximum) * 100);
      markup +=
        `<rect x="${x}" y="157" width="54" height="110" rx="4" fill="${SURFACE}"/>` +
        `<rect x="${x}" y="${267 - Math.max(2, bar)}" width="54" height="${Math.max(2, bar)}" rx="4" fill="${RED}"/>` +
        type(x + 27, 287, string(row?.date).slice(5), 10, MUTED, 500, "middle") +
        type(x + 27, 148, `${Math.round(value)}m`, 10, INK, 600, "middle");
    });
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) {
    const year = Number(firstDate.slice(0, 4));
    const month = Number(firstDate.slice(5, 7));
    const weekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const byDate = new Map(
      points.map((point) => [string(object(point)?.date), numeric(object(point)?.minutes)])
    );
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach((label, index) => {
      markup += type(48 + index * 90 + 39, 153, label, 8, MUTED, 600, "middle");
    });
    for (let day = 1; day <= days; day += 1) {
      const index = weekday + day - 1;
      const x = 48 + (index % 7) * 90;
      const y = 165 + Math.floor(index / 7) * 28;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const value = byDate.get(date) ?? 0;
      markup +=
        `<rect x="${x}" y="${y}" width="78" height="23" rx="4" fill="${heat(value)}"/>` +
        type(x + 11, y + 16, String(day), 10, value >= 180 ? BACKGROUND : INK, 600);
    }
  }
  const count = array(data?.[period === "week" ? "weekHistory" : "monthHistory"]).length;
  markup += type(
    32,
    height - 49,
    `${period === "week" ? "周" : "月"}记录 / ${count} 期公开历史`,
    10,
    MUTED,
    500
  );
  return card(widget, siteUrl, "LISTENING JOURNAL", height, markup);
}

function publicRange(data: Record<string, unknown> | null, requested: string) {
  const ranges = array(data?.publicRanges).filter(
    (range): range is string => range === "week" || range === "month" || range === "all_time"
  );
  return ranges.includes(requested) ? requested : (ranges[0] ?? null);
}

function card(
  widget: PublishedWidget,
  siteUrl: string,
  heading: string,
  height: number,
  markup: string
): SvgCard {
  const updated = widget.updatedAt ? new Date(widget.updatedAt) : null;
  const timestamp =
    updated && Number.isFinite(updated.getTime())
      ? updated.toISOString().slice(0, 16).replace("T", " ") + " UTC"
      : "";
  const status = widget.stale ? `数据待更新${timestamp ? ` / ${timestamp}` : ""}` : timestamp;
  const frame =
    `<rect x="1" y="1" width="718" height="${height - 2}" rx="12" fill="${BACKGROUND}" stroke="${LINE}"/>` +
    `<rect x="32" y="27" width="5" height="7" rx="1" fill="${RED}"/>` +
    type(46, 34, "NETEASE / PERSONAL LISTENING", 9, MUTED, 600) +
    type(32, 68, heading, 28, INK, 700) +
    type(32, 89, fit(widget.title, 42), 11, MUTED) +
    record(656, 50, 27) +
    `<line x1="32" y1="103" x2="688" y2="103" stroke="${LINE}"/>` +
    `<line x1="32" y1="${height - 37}" x2="688" y2="${height - 37}" stroke="${LINE}"/>` +
    type(32, height - 17, status, 9, MUTED) +
    type(688, height - 17, safeHost(siteUrl), 9, MUTED, 500, "end");
  return { height, markup: frame + markup, title: widget.title };
}

function record(x: number, y: number, radius: number) {
  return (
    `<circle cx="${x}" cy="${y}" r="${radius}" fill="#101115" stroke="#49454d"/>` +
    [0.86, 0.72, 0.57]
      .map(
        (scale) =>
          `<circle cx="${x}" cy="${y}" r="${(radius * scale).toFixed(2)}" fill="none" stroke="#35343e" stroke-width="1"/>`
      )
      .join("") +
    `<circle cx="${x}" cy="${y}" r="${(radius * 0.31).toFixed(2)}" fill="${RED}"/>` +
    `<circle cx="${x}" cy="${y}" r="2" fill="${BACKGROUND}"/>`
  );
}

function type(
  x: number,
  y: number,
  value: string,
  size: number,
  fill = INK,
  weight = 400,
  anchor = "start"
) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function empty(label: string, height: number) {
  return type(360, Math.round((height + 86) / 2), label, 14, MUTED, 500, "middle");
}

function heat(minutes: number) {
  if (minutes <= 0) return SURFACE;
  if (minutes < 30) return "#3f252e";
  if (minutes < 90) return "#71313f";
  if (minutes < 180) return "#a84654";
  return RED;
}
