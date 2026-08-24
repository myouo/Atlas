import {
  ClockCounterClockwise,
  Crown,
  Headphones,
  Heart,
  Medal,
  MusicNotes,
  Playlist,
  UserList
} from "@phosphor-icons/react";

import type { WidgetOf } from "../widget-types";

function Artwork({
  label,
  url,
  size = "md"
}: {
  label: string;
  url: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions =
    size === "lg"
      ? "h-20 w-20 rounded-[22px]"
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
  const { data } = widget;
  if (data.items.length === 0) return <Empty>排行是有效空数据集，或尚未完成同步</Empty>;
  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="space-y-2">
        {data.items.map((item) => (
          <div
            className="flex items-center gap-3 rounded-2xl bg-white/42 p-2"
            key={item.track.providerTrackId}
          >
            <span className="w-5 text-center text-xs font-black text-[#ff4668]">{item.rank}</span>
            <Artwork label={item.track.name} size="sm" url={item.track.coverUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-ink">{item.track.name}</p>
              <p className="truncate text-[8px] text-ink-muted">
                {item.track.artists.map((artist) => artist.name).join(" / ")}
              </p>
            </div>
            <span className="shrink-0 text-[9px] font-bold text-ink-muted">
              {item.playCount} 次
            </span>
          </div>
        ))}
      </div>
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
