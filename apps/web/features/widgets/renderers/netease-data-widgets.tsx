import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  ClockCounterClockwise,
  Crown,
  Headphones,
  Heart,
  Medal,
  MusicNotes,
  Playlist,
  Trophy,
  UserList
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import type { WidgetOf } from "../widget-types";
import { presentationSelection, presentationToggle } from "../widget-presentation";

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
      className={`${dimensions} block shrink-0 border border-white/90 bg-gradient-to-br from-rose-100 to-blue-100 bg-cover bg-center shadow-sm`}
      role="img"
      style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
    />
  );
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
    <div className="rounded-2xl border border-white/80 bg-white/48 px-3 py-2.5">
      <p className="text-[9px] font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-base font-black text-ink">{value}</p>
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {profile.avatarUrl !== undefined ? (
          <div className="relative">
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
          <div className="mt-2 flex flex-wrap gap-1.5">
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
      </div>
      {counts.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {counts.map(([label, value]) => (
            <Stat key={label} label={label} value={value.toLocaleString("zh-CN")} />
          ))}
        </div>
      ) : null}
      {medals.availability === "available" && medals.items.length > 0 ? (
        <div className="mt-auto flex items-center gap-2 overflow-hidden">
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
  const trend = data.trend;
  const metrics = [
    data.totalListenCount.availability === "available"
      ? ["累计听歌", `${data.totalListenCount.value.toLocaleString("zh-CN")} 首`]
      : null,
    data.totalListeningDuration.availability === "available"
      ? [
          "累计时长",
          formatDuration(data.totalListeningDuration.value, data.totalListeningDuration.unit)
        ]
      : null,
    data.weeklyListeningDuration.availability === "available"
      ? [
          "本周时长",
          formatDuration(data.weeklyListeningDuration.value, data.weeklyListeningDuration.unit)
        ]
      : null
  ].filter((item): item is [string, string] => item !== null);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>
      {trend.availability === "available" && trend.points.length > 0 ? (
        <div className="mt-4 min-h-0 flex-1">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-ink-muted">
            <ClockCounterClockwise aria-hidden size={14} /> 周期收听分布
          </p>
          <div className="flex h-[72px] items-end gap-1.5">
            {trend.points.map((point) => {
              const max = Math.max(...trend.points.map((item) => item.minutes), 1);
              return (
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={point.label}>
                  <span
                    className="w-full rounded-t-md bg-gradient-to-t from-rose-400 to-blue-400"
                    style={{ height: `${Math.max(8, (point.minutes / max) * 54)}px` }}
                    title={`${point.label}: ${point.minutes} 分钟`}
                  />
                  <span className="max-w-full truncate text-[7px] text-ink-muted">
                    {point.label.slice(-5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : metrics.length === 0 ? (
        <Empty>当前公开范围没有收听指标</Empty>
      ) : null}
    </div>
  );
}

export function NeteaseRankingWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.ranking"> }>) {
  if (widget.schemaVersion === 2) return <NeteaseRankingWidgetV2 widget={widget} />;
  const { data } = widget;
  return (
    <RankingBoard
      items={data.items}
      showPlayCount
      style="compact"
      totalAvailable={data.totalAvailable}
    />
  );
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-white/90 bg-white/55 p-1 shadow-sm">
          {availableRanges.map((candidate) => (
            <button
              aria-pressed={range === candidate}
              className={
                range === candidate
                  ? "rounded-lg bg-[#ff4668] px-3 py-1.5 text-[10px] font-extrabold text-white shadow-sm transition"
                  : "rounded-lg px-3 py-1.5 text-[10px] font-bold text-ink-muted transition hover:bg-white/75"
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
          <span className="shrink-0 text-[9px] font-bold text-ink-muted">
            已公开 {selected.items.length} / Provider {selected.totalAvailable}
          </span>
        ) : null}
      </div>

      {selected.availability === "available" ? (
        <RankingBoard
          key={range}
          items={selected.items}
          showPlayCount={presentationToggle(widget.presentationConfig, "showPlayCount")}
          style={style}
          totalAvailable={selected.totalAvailable}
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
  };
}

function RankingBoard({
  items,
  showPlayCount,
  style,
  totalAvailable
}: {
  readonly items: readonly RankingEntry[];
  readonly showPlayCount: boolean;
  readonly style: string;
  readonly totalAvailable: number;
}) {
  const [requestedPage, setRequestedPage] = useState(0);
  if (items.length === 0) return <Empty>这是一个有效空榜单</Empty>;
  if (style === "compact") {
    const pageSize = 5;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(requestedPage, pageCount - 1);
    const visible = items.slice(page * pageSize, page * pageSize + pageSize);
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid min-h-0 content-start gap-1.5 sm:grid-cols-2">
          {visible.map((item) => (
            <RankingRow
              item={item}
              key={item.track.providerTrackId}
              showPlayCount={showPlayCount}
            />
          ))}
          <RankingPager
            count={items.length}
            onChange={setRequestedPage}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
          />
        </div>
      </div>
    );
  }

  const podium = items.slice(0, 3);
  const remaining = items.slice(3);
  const pageSize = 3;
  const pageCount = Math.max(1, Math.ceil(remaining.length / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const visibleRemaining = remaining.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {podium.map((item) => (
          <div
            className={
              item.rank === 1
                ? "relative col-span-2 flex min-w-0 items-center gap-2 overflow-hidden rounded-[16px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white/75 to-rose-50 p-2 shadow-sm sm:col-span-1"
                : "relative flex min-w-0 items-center gap-2 overflow-hidden rounded-[16px] border border-white/80 bg-white/48 p-2"
            }
            key={item.track.providerTrackId}
          >
            <span
              className={
                item.rank === 1
                  ? "absolute top-1.5 left-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-white"
                  : "absolute top-1.5 left-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-700/75 px-1 text-[9px] font-black text-white"
              }
            >
              {item.rank === 1 ? <Trophy aria-hidden size={10} weight="fill" /> : item.rank}
            </span>
            <Artwork label={item.track.name} size="sm" url={item.track.coverUrl} />
            <div className="min-w-0 flex-1 pt-1">
              <p className="truncate text-[10px] font-extrabold text-ink">{item.track.name}</p>
              <p className="mt-0.5 truncate text-[8px] text-ink-muted">
                {item.track.artists.map((artist) => artist.name).join(" / ")}
              </p>
              {showPlayCount ? (
                <p className="mt-1 text-[8px] font-bold text-[#e83d5b]">{item.playCount} 次</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {remaining.length > 0 ? (
        <div className="mt-2.5 min-h-0 flex-1">
          <div className="grid min-h-0 content-start gap-1.5 sm:grid-cols-2">
            {visibleRemaining.map((item) => (
              <RankingRow
                item={item}
                key={item.track.providerTrackId}
                showPlayCount={showPlayCount}
              />
            ))}
            <RankingPager
              count={remaining.length}
              offset={3}
              onChange={setRequestedPage}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
            />
          </div>
        </div>
      ) : (
        <p className="mt-auto pt-3 text-center text-[8px] font-semibold text-ink-muted">
          Provider 当前返回 {totalAvailable} 条排行记录
        </p>
      )}
    </div>
  );
}

function RankingPager({
  count,
  offset = 0,
  onChange,
  page,
  pageCount,
  pageSize
}: {
  readonly count: number;
  readonly offset?: number;
  readonly onChange: (page: number) => void;
  readonly page: number;
  readonly pageCount: number;
  readonly pageSize: number;
}) {
  if (pageCount <= 1) return null;
  const first = offset + page * pageSize + 1;
  const last = offset + Math.min(count, page * pageSize + pageSize);
  return (
    <div className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/55 bg-white/24 px-2">
      <button
        aria-label="上一组排名"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/90 bg-white/65 text-blue-600 shadow-sm transition hover:bg-white disabled:opacity-30"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        type="button"
      >
        <CaretLeft aria-hidden size={12} weight="bold" />
      </button>
      <span className="min-w-20 text-center text-[8px] font-extrabold text-ink-muted">
        {first}–{last} / {offset + count}
      </span>
      <button
        aria-label="下一组排名"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/90 bg-white/65 text-blue-600 shadow-sm transition hover:bg-white disabled:opacity-30"
        disabled={page === pageCount - 1}
        onClick={() => onChange(page + 1)}
        type="button"
      >
        <CaretRight aria-hidden size={12} weight="bold" />
      </button>
    </div>
  );
}

function RankingRow({ item, showPlayCount }: { item: RankingEntry; showPlayCount: boolean }) {
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded-xl border border-transparent bg-white/40 px-2.5 py-1 transition hover:border-white/90 hover:bg-white/65">
      <span className="w-5 shrink-0 text-center text-[10px] font-black text-blue-500">
        {item.rank}
      </span>
      <Artwork label={item.track.name} size="xs" url={item.track.coverUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-extrabold text-ink">{item.track.name}</p>
        <p className="truncate text-[8px] text-ink-muted">
          {item.track.artists.map((artist) => artist.name).join(" / ")}
        </p>
      </div>
      {showPlayCount ? (
        <span className="shrink-0 rounded-full bg-rose-50 px-2 py-1 text-[8px] font-bold text-[#e83d5b]">
          {item.playCount}
        </span>
      ) : null}
    </div>
  );
}

export function NeteaseSocialWidget({
  widget
}: Readonly<{ widget: WidgetOf<"music.netease.social"> }>) {
  const data = widget.data;
  const sections = [
    ["关注", data.following, UserList],
    ["粉丝", data.followers, Heart]
  ] as const;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="关注" value={data.followingCount.toLocaleString("zh-CN")} />
        <Stat label="粉丝" value={data.followerCount.toLocaleString("zh-CN")} />
      </div>
      <div className="mt-3 grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
        {sections.map(([label, list, Icon]) =>
          list.availability === "available" ? (
            <section className="min-h-0 overflow-y-auto" key={label}>
              <p className="mb-2 flex items-center gap-1 text-[9px] font-bold text-ink-muted">
                <Icon aria-hidden size={13} />
                {label}列表
              </p>
              <div className="space-y-1.5">
                {list.items.map((person) => (
                  <div className="flex items-center gap-2" key={person.providerUserId}>
                    <Artwork label={person.displayName} size="sm" url={person.avatarUrl} />
                    <span className="truncate text-[10px] font-bold text-ink">
                      {person.displayName}
                    </span>
                  </div>
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
  const { data } = widget;
  if (data.items.length === 0) return <Empty>没有公开歌单，或歌单数据尚未同步</Empty>;
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
      {data.items.map((item) => (
        <div
          className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/42 p-2.5"
          key={item.providerPlaylistId}
        >
          <Artwork label={item.name} url={item.coverUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-extrabold text-ink">{item.name}</p>
            <p className="mt-1 text-[8px] text-ink-muted">
              {item.trackCount} 首 · {item.playCount.toLocaleString("zh-CN")} 播放
            </p>
          </div>
        </div>
      ))}
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
            className={
              size === "sm"
                ? "h-8 w-8 rounded-lg border border-white bg-cover bg-center shadow-sm"
                : "h-10 w-10 rounded-xl border border-white bg-cover bg-center shadow-sm"
            }
            key={`${url}-${index}`}
            style={{ backgroundImage: `url(${JSON.stringify(url)})`, zIndex: index }}
          />
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
  const jumpUrl = safeNeteaseJumpUrl(card.jumpUrl);
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

function safeNeteaseJumpUrl(value: unknown) {
  const target = stringValue(value);
  if (!target) return null;
  try {
    const url = new URL(target);
    if (
      url.protocol === "https:" &&
      (url.hostname === "music.163.com" || url.hostname.endsWith(".music.163.com"))
    ) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
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
