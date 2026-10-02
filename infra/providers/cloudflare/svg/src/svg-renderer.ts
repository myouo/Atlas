import type { DashboardReadModel, Profile } from "@nivalis/api-client";

import { renderVinylCard } from "./netease-vinyl-renderer";
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

export interface PublishedWidget {
  readonly data: unknown;
  readonly enabled: boolean;
  readonly id: string;
  readonly schemaVersion: number;
  readonly stale: boolean;
  readonly title: string;
  readonly type: string;
  readonly updatedAt?: string | null;
}

const WIDTH = 720;
const FONT = "'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif";
const INK = "#15376d";
const MUTED = "#647d9f";
const BLUE = "#3978e8";
const CORAL = "#eb5874";

export interface SvgCard {
  readonly height: number;
  readonly markup: string;
  readonly title: string;
}

export function renderProfileSvg(profile: Profile, siteUrl: string) {
  const card = profileCard(profile, siteUrl);
  return svgDocument(card.title, card.height, card.markup);
}

export function renderWidgetSvg(
  widget: PublishedWidget,
  siteUrl: string,
  options: URLSearchParams = new URLSearchParams()
) {
  const card = widgetCard(widget, siteUrl, options);
  return svgDocument(card.title, card.height, card.markup);
}

export function renderDashboardSvg(
  dashboard: DashboardReadModel,
  siteUrl: string,
  options: URLSearchParams = new URLSearchParams()
) {
  const cards = [
    profileCard(dashboard.profile, siteUrl),
    ...dashboard.widgets
      .filter((widget) => widget.enabled)
      .map((widget) => widgetCard(widget, siteUrl, options))
  ];
  return stackCards(`${dashboard.profile.displayName} · About Me`, cards);
}

export function renderNeteaseSvg(
  dashboard: DashboardReadModel,
  siteUrl: string,
  options: URLSearchParams = new URLSearchParams()
) {
  const cards = dashboard.widgets
    .filter((widget) => widget.enabled && widget.type.startsWith("music.netease."))
    .map((widget) => widgetCard(widget, siteUrl, options));
  return stackCards(`${dashboard.profile.displayName} · NetEase`, cards);
}

function stackCards(title: string, cards: readonly SvgCard[]) {
  if (cards.length === 0) {
    return svgDocument(title, 180, text(360, 96, "暂无公开卡片", 16, MUTED, 600, "middle"));
  }
  const gap = 16;
  const height = cards.reduce((sum, card) => sum + card.height, 0) + gap * (cards.length - 1);
  let offset = 0;
  const body = cards
    .map((card) => {
      const current = `<g transform="translate(0 ${offset})">${card.markup}</g>`;
      offset += card.height + gap;
      return current;
    })
    .join("");
  return svgDocument(title, height, body);
}

function profileCard(profile: Profile, siteUrl: string): SvgCard {
  const height = 250;
  const tags = profile.tags.slice(0, 4);
  const pills = tags
    .map((tag, index) => pill(126 + index * 133, 178, 122, tag, "#e8f1ff", BLUE))
    .join("");
  const markup =
    cardFrame(height, "About Me", "PERSONAL PROFILE", BLUE, siteUrl, "N") +
    `<circle cx="73" cy="132" r="40" fill="#d9e9ff" stroke="#fff" stroke-width="4"/>` +
    text(73, 145, initials(profile.displayName), 34, BLUE, 800, "middle") +
    text(126, 117, fit(profile.displayName, 26), 30, INK, 800) +
    text(126, 143, fit(`${profile.handle}  ·  ${profile.headline}`, 55), 15, MUTED, 600) +
    text(126, 166, fit(profile.bio, 57), 14, INK, 500) +
    pills;
  return { height, markup, title: `${profile.displayName} · About Me` };
}

function widgetCard(
  widget: PublishedWidget,
  siteUrl: string,
  options = new URLSearchParams()
): SvgCard {
  if (options.get("style") === "vinyl" && widget.type.startsWith("music.netease.")) {
    return renderVinylCard(widget, siteUrl, options);
  }
  const card = renderWidgetCard(widget, siteUrl, options);
  const updated = widget.updatedAt ? new Date(widget.updatedAt) : null;
  const timestamp =
    updated && Number.isFinite(updated.getTime())
      ? updated.toISOString().slice(0, 16).replace("T", " ") + " UTC"
      : "";
  const status = widget.stale
    ? `数据待更新${timestamp ? ` · 上次更新 ${timestamp}` : ""}`
    : timestamp
      ? `更新 ${timestamp}`
      : "";
  return {
    ...card,
    markup: card.markup + text(24, card.height - 17, status, 10, MUTED, 600)
  };
}

function renderWidgetCard(
  widget: PublishedWidget,
  siteUrl: string,
  options: URLSearchParams
): SvgCard {
  switch (widget.type) {
    case "music.netease.ranking":
      if (widget.schemaVersion === 2) return rankingCard(widget, siteUrl, options);
      return genericCard(widget, siteUrl);
    case "music.netease.identity":
      return identityCard(widget, siteUrl);
    case "music.netease.playlists":
      return playlistsCard(widget, siteUrl);
    case "music.netease.showcase":
      if (widget.schemaVersion === 2) return showcaseCard(widget, siteUrl);
      return genericCard(widget, siteUrl);
    case "music.netease.calendar":
      return calendarCard(widget, siteUrl, options);
    case "steam.profile":
      return steamCard(widget, siteUrl);
    default:
      return genericCard(widget, siteUrl);
  }
}

function rankingCard(widget: PublishedWidget, siteUrl: string, options: URLSearchParams): SvgCard {
  const height = 346;
  const data = object(widget.data);
  const requested = options.get("range") === "all_time" ? "all_time" : "week";
  const range =
    data?.publicRanges && array(data.publicRanges).includes(requested)
      ? requested
      : array(data?.publicRanges).includes("week")
        ? "week"
        : "all_time";
  const selected = object(data?.[range]);
  const items = selected?.availability === "available" ? array(selected.items).slice(0, 8) : [];
  const accent = CORAL;
  let content =
    cardFrame(height, widget.title, "NETEASE · LISTENING RANK", accent, siteUrl, "♪") +
    pill(24, 89, 114, range === "week" ? "最近一周" : "全部时间", "#ffe7ed", accent) +
    text(
      680,
      108,
      `${items.length} / ${numeric(selected?.totalAvailable) ?? 0}`,
      13,
      MUTED,
      600,
      "end"
    );
  if (items.length === 0) content += emptyMessage("当前榜单暂无公开数据", height);
  for (const [index, item] of items.entries()) {
    const row = object(item);
    const track = object(row?.track);
    const artists = array(track?.artists)
      .map((artist) => string(object(artist)?.name))
      .filter(Boolean);
    const column = index % 2;
    const line = Math.floor(index / 2);
    const x = 24 + column * 348;
    const y = 127 + line * 47;
    content +=
      `<rect x="${x}" y="${y}" width="332" height="41" rx="11" fill="${index < 3 ? "#fff1f4" : "#f3f7ff"}"/>` +
      text(x + 17, y + 26, String(index + 1), 16, accent, 800) +
      text(x + 45, y + 18, fit(string(track?.name) || "未知曲目", 24), 13, INK, 700) +
      text(x + 45, y + 34, fit(artists.join(" / "), 28), 10, MUTED, 500);
  }
  return { height, markup: content, title: widget.title };
}

function identityCard(widget: PublishedWidget, siteUrl: string): SvgCard {
  const height = 240;
  const data = object(widget.data);
  const profile = object(data?.profile);
  const vip = object(data?.vip);
  const name = string(profile?.displayName) || "网易云用户";
  let content =
    cardFrame(height, widget.title, "NETEASE · IDENTITY", CORAL, siteUrl, "♪") +
    `<circle cx="69" cy="132" r="37" fill="#ffe4ea" stroke="#fff" stroke-width="4"/>` +
    text(69, 144, initials(name), 31, CORAL, 800, "middle") +
    text(124, 123, fit(name, 31), 27, INK, 800) +
    pill(125, 137, 72, `Lv.${numeric(profile?.level) ?? "—"}`, "#e9f1ff", BLUE) +
    (vip?.availability === "available" && vip.active
      ? pill(207, 137, 130, `黑胶 VIP ${numeric(vip.redVipLevel) ?? ""}`, "#fff0f3", CORAL)
      : "");
  const metrics = [
    ["关注", numeric(profile?.followingCount)],
    ["粉丝", numeric(profile?.followerCount)],
    ["歌单", numeric(profile?.playlistCount)]
  ] as const;
  metrics.forEach(([label, value], index) => {
    const x = 126 + index * 175;
    content +=
      text(x, 202, value === null ? "—" : formatNumber(value), 22, CORAL, 800) +
      text(x + 65, 202, label, 13, MUTED, 600);
  });
  return { height, markup: content, title: widget.title };
}

function playlistsCard(widget: PublishedWidget, siteUrl: string): SvgCard {
  const height = 315;
  const data = object(widget.data);
  const items = array(data?.items).slice(0, 6);
  let content = cardFrame(height, widget.title, "NETEASE · CREATED PLAYLISTS", CORAL, siteUrl, "♪");
  if (items.length === 0) content += emptyMessage("暂无可展示的歌单", height);
  for (const [index, item] of items.entries()) {
    const row = object(item);
    const x = 24 + (index % 2) * 348;
    const y = 94 + Math.floor(index / 2) * 67;
    content +=
      `<rect x="${x}" y="${y}" width="332" height="58" rx="13" fill="#f2f7ff"/>` +
      `<rect x="${x + 10}" y="${y + 10}" width="38" height="38" rx="10" fill="#ffe1e9"/>` +
      text(x + 29, y + 35, "♫", 18, CORAL, 800, "middle") +
      text(x + 59, y + 26, fit(string(row?.name) || "未命名歌单", 24), 13, INK, 700) +
      text(
        x + 59,
        y + 45,
        `${formatNumber(numeric(row?.trackCount) ?? 0)} 首 · ${formatNumber(numeric(row?.playCount) ?? 0)} 播放`,
        11,
        MUTED,
        500
      );
  }
  return { height, markup: content, title: widget.title };
}

function showcaseCard(widget: PublishedWidget, siteUrl: string): SvgCard {
  const height = 318;
  const data = object(widget.data);
  const items = array(data?.items).slice(0, 6);
  let content = cardFrame(height, widget.title, "NETEASE · MUSIC SHOWCASE", CORAL, siteUrl, "♪");
  if (items.length === 0) content += emptyMessage("暂无可展示的音乐名片", height);
  for (const [index, item] of items.entries()) {
    const card = object(object(item)?.card);
    const x = 24 + (index % 3) * 232;
    const y = 94 + Math.floor(index / 3) * 101;
    const title = string(card?.title) || string(card?.name) || "音乐名片";
    const subtitle =
      string(card?.subtitle) ||
      array(card?.artists)
        .map((artist) => (typeof artist === "string" ? artist : string(object(artist)?.name)))
        .filter(Boolean)
        .join(" / ");
    content +=
      `<rect x="${x}" y="${y}" width="216" height="89" rx="14" fill="#f5f7ff" stroke="#e4ebf8"/>` +
      `<rect x="${x + 10}" y="${y + 12}" width="42" height="42" rx="10" fill="#f9dce7"/>` +
      text(x + 31, y + 41, "♪", 21, CORAL, 800, "middle") +
      text(x + 61, y + 32, fit(title, 16), 12, INK, 700) +
      text(x + 61, y + 51, fit(subtitle, 18), 10, MUTED, 500) +
      text(x + 12, y + 76, `NO. ${index + 1}`, 10, CORAL, 700);
  }
  return { height, markup: content, title: widget.title };
}

function calendarCard(widget: PublishedWidget, siteUrl: string, options: URLSearchParams): SvgCard {
  const height = 315;
  const data = object(widget.data);
  const requested = options.get("period") === "week" ? "week" : "month";
  const period = array(data?.publicRanges).includes(requested)
    ? requested
    : array(data?.publicRanges).includes("month")
      ? "month"
      : "week";
  const current = object(data?.[period]);
  const points = current?.availability === "available" ? array(current.points) : [];
  const backfill = object(data?.historyBackfill);
  const historyCount = array(data?.[period === "week" ? "weekHistory" : "monthHistory"]).length;
  let content =
    cardFrame(height, widget.title, "NETEASE · LISTENING CALENDAR", CORAL, siteUrl, "▦") +
    pill(24, 89, 104, period === "week" ? "本周" : "本月", "#ffe7ed", CORAL) +
    text(
      147,
      108,
      points.length ? periodLabel(string(object(points[0])?.date), period) : "暂无记录",
      14,
      INK,
      700
    ) +
    text(
      680,
      108,
      `${formatDuration(numeric(current?.totalMinutes) ?? 0)} · ${historyCount} 期历史`,
      12,
      MUTED,
      600,
      "end"
    );
  if (points.length === 0) {
    content += emptyMessage("当前公开范围暂无收听记录", height);
  } else if (period === "week") {
    const max = Math.max(1, ...points.map((point) => numeric(object(point)?.minutes) ?? 0));
    points.slice(0, 7).forEach((point, index) => {
      const row = object(point);
      const minutes = numeric(row?.minutes) ?? 0;
      const x = 51 + index * 91;
      const barHeight = Math.round((minutes / max) * 95);
      content +=
        `<rect x="${x}" y="${231 - barHeight}" width="50" height="${Math.max(3, barHeight)}" rx="9" fill="${heatColor(minutes)}"/>` +
        text(x + 25, 251, string(row?.date).slice(5), 11, MUTED, 600, "middle") +
        text(x + 25, 222 - barHeight, `${Math.round(minutes)}m`, 10, CORAL, 700, "middle");
    });
  } else {
    const firstDate = string(object(points[0])?.date);
    const byDate = new Map(
      points.map((point) => [string(object(point)?.date), numeric(object(point)?.minutes) ?? 0])
    );
    const year = Number(firstDate.slice(0, 4));
    const month = Number(firstDate.slice(5, 7));
    const weekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const days = year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
    for (let day = 1; day <= days; day += 1) {
      const index = weekday + day - 1;
      const x = 66 + (index % 7) * 90;
      const y = 143 + Math.floor(index / 7) * 25;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const minutes = byDate.get(date);
      content +=
        `<rect x="${x}" y="${y}" width="70" height="19" rx="6" fill="${minutes === undefined ? "#e9eef6" : heatColor(minutes)}"/>` +
        text(
          x + 35,
          y + 14,
          String(day),
          10,
          minutes && minutes > 90 ? "#fff" : INK,
          600,
          "middle"
        );
    }
  }
  content += text(
    24,
    285,
    backfill?.[period === "week" ? "weekComplete" : "monthComplete"] === true
      ? "已回溯至最早可用记录"
      : "更早记录正在后台同步",
    11,
    MUTED,
    600
  );
  return { height, markup: content, title: widget.title };
}

function steamCard(widget: PublishedWidget, siteUrl: string): SvgCard {
  const height = 215;
  const data = object(widget.data);
  let content = cardFrame(height, widget.title, "STEAM · PROFILE", BLUE, siteUrl, "S");
  if (!data || Object.keys(data).length === 0) {
    content += emptyMessage("Steam 数据待更新", height);
  } else {
    const library = object(data.library);
    const recent = object(data.recentGames);
    const metrics =
      widget.schemaVersion >= 2
        ? ([
            ["游戏", numeric(library?.gameCount)],
            [
              "游玩小时",
              numeric(library?.playtimeMinutes) === null
                ? null
                : Math.round(numeric(library?.playtimeMinutes)! / 60)
            ],
            ["最近游戏", numeric(recent?.totalCount)]
          ] as const)
        : ([
            ["游戏", numeric(data.games)],
            ["时长", numeric(data.playtimeHours)],
            ["成就", numeric(data.achievements)]
          ] as const);
    metrics.forEach(([label, value], index) => {
      const x = 32 + index * 222;
      content +=
        `<rect x="${x}" y="99" width="203" height="75" rx="14" fill="#edf4ff"/>` +
        text(x + 18, 128, label, 13, MUTED, 600) +
        text(x + 18, 158, value === null ? "—" : formatNumber(value), 24, INK, 800);
    });
  }
  return { height, markup: content, title: widget.title };
}

function genericCard(widget: PublishedWidget, siteUrl: string): SvgCard {
  const height = 220;
  const data = object(widget.data);
  const metrics = publicScalars(data).slice(0, 3);
  let content = cardFrame(
    height,
    widget.title,
    fit(widget.type, 38).toUpperCase(),
    BLUE,
    siteUrl,
    "◇"
  );
  if (metrics.length === 0) content += emptyMessage("在 About Me 查看完整卡片", height);
  metrics.forEach(([key, value], index) => {
    const x = 27 + index * 224;
    content +=
      `<rect x="${x}" y="101" width="207" height="75" rx="14" fill="#eff5ff"/>` +
      text(x + 15, 125, fit(labelFor(key), 18), 11, MUTED, 600) +
      text(x + 15, 155, fit(value, 16), 20, INK, 800);
  });
  return { height, markup: content, title: widget.title };
}

function publicScalars(data: Record<string, unknown> | null): [string, string][] {
  if (!data) return [];
  const ignored =
    /(?:^|_)(?:id|url|provider|availability|coverage|provenance|schema|public|reason|source|key|secret|token|credential|password|cookie|auth)(?:$|_)/i;
  const ignoreKey = (key: string) => ignored.test(key.replace(/([a-z0-9])([A-Z])/g, "$1_$2"));
  const result: [string, string][] = [];
  for (const [key, value] of Object.entries(data)) {
    if (ignoreKey(key)) continue;
    if (typeof value === "number" && Number.isFinite(value))
      result.push([key, formatNumber(value)]);
    else if (typeof value === "string" && value.trim()) result.push([key, value]);
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (ignoreKey(nestedKey)) continue;
        if (typeof nestedValue === "number" && Number.isFinite(nestedValue))
          result.push([nestedKey, formatNumber(nestedValue)]);
      }
    }
  }
  return result;
}

function cardFrame(
  height: number,
  title: string,
  kicker: string,
  accent: string,
  siteUrl: string,
  symbol: string
) {
  const host = safeHost(siteUrl);
  return (
    `<rect x="1" y="1" width="718" height="${height - 2}" rx="23" fill="url(#surface)" stroke="#d8e5f6" stroke-width="2"/>` +
    `<rect x="1" y="1" width="7" height="${height - 2}" rx="4" fill="${accent}"/>` +
    `<circle cx="650" cy="-15" r="135" fill="${accent}" opacity="0.035"/>` +
    `<rect x="23" y="22" width="43" height="43" rx="13" fill="${accent}"/>` +
    text(44.5, 52, symbol, 24, "#fff", 800, "middle") +
    text(82, 42, fit(title, 38), 19, INK, 800) +
    text(82, 62, fit(kicker, 58), 10, MUTED, 700) +
    `<line x1="23" y1="78" x2="697" y2="78" stroke="#dce8f7"/>` +
    text(681, height - 17, host, 10, MUTED, 600, "end")
  );
}

function svgDocument(title: string, height: number, markup: string) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeXml(title)}" font-family="${FONT}">` +
    `<title>${escapeXml(title)}</title>` +
    `<defs><linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#edf5ff"/></linearGradient></defs>` +
    markup +
    `</svg>`
  );
}

function text(
  x: number,
  y: number,
  value: string,
  size: number,
  fill: string,
  weight: number,
  anchor = "start"
) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function pill(x: number, y: number, width: number, label: string, fill: string, color: string) {
  return (
    `<rect x="${x}" y="${y}" width="${width}" height="27" rx="13.5" fill="${fill}"/>` +
    text(x + width / 2, y + 18, fit(label, Math.floor(width / 11)), 12, color, 700, "middle")
  );
}

function emptyMessage(label: string, height: number) {
  return (
    `<rect x="24" y="102" width="672" height="${height - 142}" rx="16" fill="#f2f7ff" stroke="#dce8f7" stroke-dasharray="5 5"/>` +
    text(360, Math.round((height + 83) / 2), label, 15, MUTED, 600, "middle")
  );
}

function heatColor(minutes: number) {
  if (minutes <= 0) return "#e9eef6";
  if (minutes < 30) return "#f5d6e2";
  if (minutes < 90) return "#ebafc3";
  if (minutes < 180) return "#e8789c";
  return "#d64b78";
}

function labelFor(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}
