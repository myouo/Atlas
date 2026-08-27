import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ModuleShell } from "../../../design-system/module-shell";
import type { WidgetOf } from "../widget-types";
import {
  NeteaseListeningCalendarWidget,
  NeteasePlaylistsWidget,
  NeteaseRankingWidget,
  NeteaseShowcaseWidget,
  NeteaseSocialWidget
} from "./netease-data-widgets";

afterEach(cleanup);

describe("NetEase semantic data widgets", () => {
  it("renders Provider-reported monthly daily minutes as a switchable heatmap", async () => {
    const { container } = render(<NeteaseListeningCalendarWidget widget={calendarWidget()} />);
    expect(screen.getByRole("button", { name: "本月" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "2026-08-01，61 分钟" })).toBeInTheDocument();
    expect(screen.getAllByText("2026年8月")).toHaveLength(1);
    expect(container.querySelectorAll('[role="img"][aria-label*="分钟"]').length).toBe(27);

    await userEvent.click(screen.getByRole("button", { name: "本周" }));
    expect(screen.getByRole("img", { name: "2026-08-25，0 分钟" })).toHaveAttribute(
      "data-rhythm-state",
      "dormant"
    );
    expect(screen.getByRole("img", { name: "2026-08-24，283 分钟" })).toHaveAttribute(
      "data-rhythm-state",
      "peak"
    );
    expect(container.querySelector("[data-weekly-rhythm]")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /在网易云打开歌曲 Week wall/ })).toHaveLength(12);
  });

  it("expands both calendars newest-first and exposes the complete Provider record walls", async () => {
    render(
      <ModuleShell accent="coral" editable={false} expandable title="网易云 · 收听日历">
        <NeteaseListeningCalendarWidget widget={calendarWidget()} />
      </ModuleShell>
    );
    await userEvent.click(screen.getByRole("button", { name: "放大 网易云 · 收听日历" }));
    const dialog = await screen.findByRole("dialog", { name: "网易云 · 收听日历" });
    expect(within(dialog).getByText("周播放日历")).toBeVisible();
    expect(within(dialog).getByText("月播放日历")).toBeVisible();
    expect(within(dialog).getByText("8/16 – 8/22")).toBeVisible();
    expect(within(dialog).getByText("2026年7月")).toBeVisible();
    expect(within(dialog).getAllByText("历史")).toHaveLength(2);
    const dailyRows = [...dialog.querySelectorAll('[role="img"][aria-label$="分钟"]')];
    expect(dailyRows[0]).toHaveAttribute("aria-label", "2026-08-27，103 分钟");
    expect(dailyRows[1]).toHaveAttribute("aria-label", "2026-08-26，276 分钟");
    expect(within(dialog).getAllByRole("link", { name: /在网易云打开歌曲/ })).toHaveLength(40);
  });

  it("falls back to previous-week left and current-week right when the weekly wall is absent", () => {
    const widget = calendarWidget();
    if (widget.data.week.availability !== "available") {
      throw new Error("Calendar fixture week must be available.");
    }
    const { container } = render(
      <NeteaseListeningCalendarWidget
        widget={{
          ...widget,
          data: {
            ...widget.data,
            month: { availability: "unavailable", reason: "not_public" },
            publicRanges: ["week"],
            week: {
              ...widget.data.week,
              recordWall: { availability: "unavailable", reason: "provider_omitted" }
            }
          }
        }}
      />
    );
    expect(
      [...container.querySelectorAll("[data-weekly-label]")].map((node) =>
        node.getAttribute("data-weekly-label")
      )
    ).toEqual(["上周", "本周"]);
  });

  it("allocates six adaptive calendar rows for a long month without fixed-height cells", () => {
    const widget = calendarWidget();
    const points = Array.from({ length: 31 }, (_, index) => ({
      date: `2026-03-${String(index + 1).padStart(2, "0")}`,
      minutes: index * 10
    }));
    const { container } = render(
      <NeteaseListeningCalendarWidget
        widget={{
          ...widget,
          data: {
            ...widget.data,
            month: {
              availability: "available",
              coverage: "provider_month",
              listenDays: 30,
              period: "month",
              points,
              provenance: "provider_reported",
              totalMinutes: 4_650
            }
          }
        }}
      />
    );
    expect(container.querySelector('[data-calendar-rows="6"]')).toHaveStyle({
      gridTemplateRows: "repeat(6, minmax(0, 1fr))"
    });
  });

  it("keeps playlist cards compact while the reading panel receives every public row", async () => {
    render(
      <ModuleShell accent="coral" editable={false} expandable title="网易云 · 创建歌单">
        <NeteasePlaylistsWidget widget={playlistsWidget()} />
      </ModuleShell>
    );
    expect(screen.getAllByRole("link", { name: /在网易云打开歌单/ })).toHaveLength(6);

    await userEvent.click(screen.getByRole("button", { name: "放大 网易云 · 创建歌单" }));
    expect(await screen.findByRole("dialog", { name: "网易云 · 创建歌单" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /在网易云打开歌单/ })).toHaveLength(8);
  });

  it("switches between weekly and all-time rankings inside one card", async () => {
    render(<NeteaseRankingWidget widget={rankingWidget()} />);
    expect(screen.getByText("Weekly One")).toBeInTheDocument();
    expect(screen.queryByText("All-time One")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "在网易云查看听歌榜单" })).toHaveAttribute(
      "href",
      "https://music.163.com/user/songs/rank?id=10001"
    );
    expect(screen.getByRole("link", { name: "在网易云打开歌曲 Weekly One" })).toHaveAttribute(
      "href",
      "https://music.163.com/song?id=1"
    );

    await userEvent.click(screen.getByRole("button", { name: "全部时间" }));
    expect(screen.getByText("All-time One")).toBeInTheDocument();
    expect(screen.queryByText("Weekly One")).not.toBeInTheDocument();
  });

  it("uses a dense preview and reveals both complete rankings in the full-screen card", async () => {
    const { container } = render(
      <ModuleShell accent="coral" editable={false} expandable title="网易云 · 听歌双榜">
        <NeteaseRankingWidget widget={rankingWidget()} />
      </ModuleShell>
    );
    expect(container.querySelector(".overflow-y-auto")).toBeNull();
    expect(screen.getByText("Weekly 6")).toBeInTheDocument();
    expect(screen.queryByText("Weekly 7")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一组排名" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "放大 网易云 · 听歌双榜" }));
    expect(await screen.findByRole("dialog", { name: "网易云 · 听歌双榜" })).toBeVisible();
    expect(screen.getByText("Weekly 100")).toBeInTheDocument();
    expect(screen.getByText("All-time One")).toBeInTheDocument();
    expect(screen.getByText("All-time 100")).toBeInTheDocument();
  });

  it("renders a curated multi-item showcase without auto-selecting history", () => {
    render(<NeteaseShowcaseWidget widget={showcaseWidget()} />);
    expect(screen.getByText("Curated Song")).toBeInTheDocument();
    expect(screen.getByText("Curated Playlist")).toBeInTheDocument();
    expect(screen.getByText("Curated Medal")).toBeInTheDocument();
    expect(screen.getByText("累计播放时间")).toBeInTheDocument();
    expect(screen.queryByText(/历史第一/)).not.toBeInTheDocument();
  });

  it("renders Provider-native profile showcase metadata", () => {
    const widget = showcaseWidget();
    const { container } = render(
      <NeteaseShowcaseWidget
        widget={{
          ...widget,
          data: {
            availability: "available",
            items: [
              {
                card: {
                  badgeText: "音乐浓度",
                  cardKind: "duration",
                  coverUrl: "https://p1.music.126.net/fixture/one.jpg",
                  creativeType: "SHOWCASE_LIST",
                  description: "累计 162 小时",
                  imageUrls: [
                    "https://p1.music.126.net/fixture/one.jpg",
                    "https://p1.music.126.net/fixture/two.jpg"
                  ],
                  jumpUrl: "javascript:alert(1)",
                  kind: "provider_music_card",
                  providerCardId: "native-duration",
                  resourceId: "listen-duration",
                  resourceType: "listen_duration",
                  textLines: ["累计 162 小时", "本周 91 分钟"],
                  title: "听歌时长"
                },
                resourceId: "native-duration",
                source: "provider_music_card"
              }
            ],
            maxItems: 6,
            mode: "provider",
            provider: "netease"
          },
          dataConfig: { mode: "provider" }
        }}
      />
    );
    expect(screen.getByText("听歌时长")).toBeInTheDocument();
    expect(screen.getByText("累计 162 小时")).toBeInTheDocument();
    expect(screen.getByText("音乐浓度")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "听歌时长 的图片组合" })).toBeInTheDocument();
    expect(container.querySelectorAll('img[loading="lazy"]').length).toBe(2);
    expect(screen.queryByRole("link", { name: "打开 听歌时长" })).not.toBeInTheDocument();
  });

  it("hides Provider resource codes and uses real artists as song subtitles", () => {
    const widget = showcaseWidget();
    render(
      <NeteaseShowcaseWidget
        widget={{
          ...widget,
          data: {
            availability: "available",
            items: [
              {
                card: {
                  artists: [],
                  cardKind: "ranking",
                  coverUrl: null,
                  imageUrls: [],
                  jumpUrl: "https://music.163.com/user/songs/rank?id=10001",
                  kind: "provider_music_card",
                  providerCardId: "ranking",
                  resourceType: "song_rank",
                  title: "听歌排行"
                },
                resourceId: "ranking",
                source: "provider_music_card"
              },
              {
                card: {
                  artists: [{ name: "酔シグレ" }, { name: "Lucia" }],
                  cardKind: "song",
                  coverUrl: null,
                  imageUrls: [],
                  jumpUrl: "https://music.163.com/song?id=20001",
                  kind: "provider_music_card",
                  providerCardId: "song-one",
                  resourceType: "song",
                  title: "ロスト・シルフィード"
                },
                resourceId: "song-one",
                source: "provider_music_card"
              }
            ],
            maxItems: 6,
            mode: "provider",
            provider: "netease"
          },
          dataConfig: { mode: "provider" }
        }}
      />
    );

    expect(screen.getByText("听歌排行")).toBeInTheDocument();
    expect(screen.getByText("酔シグレ / Lucia")).toBeInTheDocument();
    expect(screen.queryByText("song_rank")).not.toBeInTheDocument();
    expect(screen.queryByText("song")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开 听歌排行" })).toHaveAttribute(
      "href",
      "https://music.163.com/user/songs/rank?id=10001"
    );
    expect(screen.getByRole("link", { name: "打开 ロスト・シルフィード" })).toHaveAttribute(
      "href",
      "https://music.163.com/song?id=20001"
    );
  });

  it("renders following and followers as separate views with separate entrances", () => {
    const { container, rerender } = render(
      <NeteaseSocialWidget widget={socialWidget("following")} />
    );
    expect(screen.getByText("关注")).toBeInTheDocument();
    expect(screen.queryByText("粉丝")).not.toBeInTheDocument();
    expect(container.querySelector(".netease-social .netease-stat")).toBeNull();
    expect(screen.getByRole("link", { name: "在网易云查看关注" })).toHaveAttribute(
      "href",
      "https://music.163.com/user/follows?id=10001"
    );

    rerender(<NeteaseSocialWidget widget={socialWidget("followers")} />);
    expect(screen.getByText("粉丝")).toBeInTheDocument();
    expect(screen.queryByText("关注")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "在网易云查看粉丝" })).toHaveAttribute(
      "href",
      "https://music.163.com/user/fans?id=10001"
    );
  });
});

function calendarWidget(): WidgetOf<"music.netease.calendar"> {
  const monthPoints = Array.from({ length: 27 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    minutes: index === 0 ? 61 : (index * 23) % 260
  }));
  return {
    data: {
      month: {
        availability: "available",
        coverage: "provider_month",
        listenDays: 24,
        period: "month",
        points: monthPoints,
        provenance: "provider_reported",
        recordWall: calendarRecordWall("month"),
        totalMinutes: 3_240
      },
      previousWeek: {
        availability: "available",
        coverage: "provider_week",
        listenDays: 6,
        period: "week",
        points: Array.from({ length: 7 }, (_, index) => ({
          date: `2026-08-${String(index + 16).padStart(2, "0")}`,
          minutes: index === 2 ? 0 : 40 + index * 11
        })),
        provenance: "provider_reported",
        recordWall: { availability: "unavailable", reason: "provider_omitted" },
        totalMinutes: 426
      },
      previousMonth: {
        availability: "available",
        coverage: "provider_month",
        listenDays: 25,
        period: "month",
        points: Array.from({ length: 31 }, (_, index) => ({
          date: `2026-07-${String(index + 1).padStart(2, "0")}`,
          minutes: index % 6 === 0 ? 0 : 30 + index * 7
        })),
        provenance: "provider_reported",
        recordWall: { availability: "unavailable", reason: "provider_omitted" },
        totalMinutes: 3_875
      },
      provider: "netease",
      publicRanges: ["week", "month"],
      week: {
        availability: "available",
        coverage: "provider_week",
        listenDays: 5,
        period: "week",
        points: [
          { date: "2026-08-23", minutes: 27 },
          { date: "2026-08-24", minutes: 283 },
          { date: "2026-08-25", minutes: 0 },
          { date: "2026-08-26", minutes: 276 },
          { date: "2026-08-27", minutes: 103 }
        ],
        provenance: "provider_reported",
        recordWall: calendarRecordWall("week"),
        totalMinutes: 689
      }
    },
    dataConfig: { publicRanges: ["week", "month"] },
    enabled: true,
    id: "00000000-0000-4000-8000-000000009209",
    presentationConfig: {},
    provider: "netease",
    schemaVersion: 1,
    stale: false,
    title: "网易云 · 收听日历",
    type: "music.netease.calendar",
    updatedAt: "2026-08-27T00:00:00.000Z"
  };
}

function calendarRecordWall(period: "month" | "week") {
  const label = period === "week" ? "Week" : "Month";
  return {
    availability: "available" as const,
    coverage:
      period === "week" ? ("provider_week_rank" as const) : ("provider_month_rank" as const),
    items: Array.from({ length: 20 }, (_, index) => ({
      albumName: `${label} album ${index + 1}`,
      artists: [`${label} artist`],
      coverUrl: `https://p1.music.126.net/sanitized-fixture/${period}-${index + 1}.jpg`,
      name: `${label} wall song ${index + 1}`,
      playCount: 20 - index,
      providerTrackId: String(30_000 + index),
      webUrl: `https://music.163.com/song?id=${30_000 + index}`
    })),
    ordering: "provider" as const,
    provenance: "provider_reported" as const,
    songCount: 64
  };
}

function playlistsWidget(): WidgetOf<"music.netease.playlists"> {
  return {
    data: {
      availability: "available",
      complete: true,
      items: Array.from({ length: 8 }, (_, index) => ({
        coverUrl: null,
        name: `Playlist ${index + 1}`,
        playCount: index,
        providerPlaylistId: String(index + 1),
        subscribedCount: 0,
        tags: [],
        trackCount: index + 1,
        webUrl: `https://music.163.com/playlist?id=${index + 1}`
      })),
      provider: "netease",
      providerTotal: 8,
      publicLimit: 8
    },
    dataConfig: { publicLimit: 8 },
    enabled: true,
    id: "00000000-0000-4000-8000-000000009206",
    presentationConfig: {},
    provider: "netease",
    schemaVersion: 1,
    stale: false,
    title: "网易云 · 创建歌单",
    type: "music.netease.playlists",
    updatedAt: "2026-08-27T00:00:00.000Z"
  };
}

function socialWidget(view: "following" | "followers"): WidgetOf<"music.netease.social"> {
  const person = {
    avatarDecorationUrl: null,
    avatarUrl: null,
    displayName: view === "following" ? "Following Fixture" : "Follower Fixture",
    providerUserId: view === "following" ? "11001" : "12001",
    signature: null,
    vipType: null,
    webUrl: `https://music.163.com/user/home?id=${view === "following" ? "11001" : "12001"}`
  };
  const hidden = { availability: "unavailable" as const, reason: "not_public" as const };
  const available = { availability: "available" as const, complete: true, items: [person] };
  return {
    data: {
      followerCount: 44,
      followers: view === "followers" ? available : hidden,
      followersWebUrl: "https://music.163.com/user/fans?id=10001",
      following: view === "following" ? available : hidden,
      followingCount: 174,
      followingWebUrl: "https://music.163.com/user/follows?id=10001",
      provider: "netease",
      publicLimit: 8,
      publicLists: [view],
      view,
      webUrl: "https://music.163.com/user/home?id=10001"
    },
    dataConfig: { publicLimit: 8, publicLists: [view], view },
    enabled: true,
    id: `00000000-0000-4000-8000-${view === "following" ? "000000009103" : "000000009104"}`,
    presentationConfig: {},
    provider: "netease",
    schemaVersion: 1,
    stale: false,
    title: view === "following" ? "网易云 · 关注" : "网易云 · 粉丝",
    type: "music.netease.social",
    updatedAt: "2026-08-26T00:00:00.000Z"
  };
}

function rankingWidget(): Extract<WidgetOf<"music.netease.ranking">, { schemaVersion: 2 }> {
  return {
    data: {
      allTime: {
        availability: "available",
        coverage: "provider_top_100",
        items: rankingItems("all", "All-time"),
        totalAvailable: 100
      },
      provider: "netease",
      publicLimit: 100,
      publicRanges: ["week", "all_time"],
      webUrl: "https://music.163.com/user/songs/rank?id=10001",
      week: {
        availability: "available",
        coverage: "provider_top_100",
        items: rankingItems("week", "Weekly"),
        totalAvailable: 100
      }
    },
    dataConfig: { publicLimit: 100, publicRanges: ["week", "all_time"] },
    enabled: true,
    id: "00000000-0000-4000-8000-000000009101",
    presentationConfig: { rankingStyle: "editorial", showPlayCount: true },
    provider: "netease",
    schemaVersion: 2,
    stale: false,
    title: "网易云 · 听歌双榜",
    type: "music.netease.ranking",
    updatedAt: "2026-08-25T00:00:00.000Z"
  };
}

function showcaseWidget(): Extract<WidgetOf<"music.netease.showcase">, { schemaVersion: 2 }> {
  return {
    data: {
      availability: "available",
      items: [
        {
          card: { kind: "track", playCount: 12, track: track("song-1", "Curated Song") },
          resourceId: "song-1",
          source: "weekly_track"
        },
        {
          card: {
            coverUrl: null,
            kind: "playlist",
            name: "Curated Playlist",
            tags: ["ACG"],
            trackCount: 42
          },
          resourceId: "playlist-1",
          source: "created_playlist"
        },
        {
          card: {
            description: "Fixture medal",
            iconUrl: null,
            kind: "medal",
            name: "Curated Medal",
            worn: true
          },
          resourceId: "medal-1",
          source: "medal"
        },
        {
          card: {
            kind: "duration",
            label: "累计播放时间",
            unit: "seconds",
            value: 360_000
          },
          resourceId: "total",
          source: "listening_duration"
        }
      ],
      maxItems: 6,
      mode: "custom",
      provider: "netease"
    },
    dataConfig: { selections: [] },
    enabled: true,
    id: "00000000-0000-4000-8000-000000009102",
    presentationConfig: { galleryStyle: "editorial", showMeta: true },
    provider: "netease",
    schemaVersion: 2,
    stale: false,
    title: "网易云 · 音乐展柜",
    type: "music.netease.showcase",
    updatedAt: "2026-08-25T00:00:00.000Z"
  };
}

function rankingItem(id: string, name: string, rank: number, playCount: number) {
  return {
    playCount,
    rank,
    score: 100,
    track: track(id, name)
  };
}

function rankingItems(idPrefix: string, namePrefix: string) {
  return Array.from({ length: 100 }, (_, index) =>
    rankingItem(
      `${idPrefix}-${index + 1}`,
      index === 0 ? `${namePrefix} One` : `${namePrefix} ${index + 1}`,
      index + 1,
      100 - index
    )
  );
}

function track(id: string, name: string) {
  return {
    albumName: "Fixture Album",
    artists: [
      {
        name: "Fixture Artist",
        providerArtistId: "30001",
        webUrl: "https://music.163.com/artist?id=30001"
      }
    ],
    coverUrl: null,
    durationMs: 240_000,
    name,
    providerTrackId: id,
    webUrl: `https://music.163.com/song?id=${id.replace(/\D/g, "") || "20001"}`
  };
}
