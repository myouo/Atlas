import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { WidgetOf } from "../widget-types";
import { NeteaseRankingWidget, NeteaseShowcaseWidget } from "./netease-data-widgets";

afterEach(cleanup);

describe("NetEase semantic data widgets", () => {
  it("switches between weekly and all-time rankings inside one card", async () => {
    render(<NeteaseRankingWidget widget={rankingWidget()} />);
    expect(screen.getByText("Weekly One")).toBeInTheDocument();
    expect(screen.queryByText("All-time One")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "全部时间" }));
    expect(screen.getByText("All-time One")).toBeInTheDocument();
    expect(screen.queryByText("Weekly One")).not.toBeInTheDocument();
  });

  it("pages ranking rows without exposing a native scrollbar", async () => {
    const { container } = render(<NeteaseRankingWidget widget={rankingWidget()} />);
    expect(container.querySelector(".overflow-y-auto")).toBeNull();
    expect(screen.getByText("Weekly 6")).toBeInTheDocument();
    expect(screen.queryByText("Weekly 7")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "下一组排名" }));
    expect(screen.getByText("Weekly 7")).toBeInTheDocument();
    expect(screen.queryByText("Weekly 6")).not.toBeInTheDocument();
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
    render(
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
  });
});

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
      publicLimit: 12,
      publicRanges: ["week", "all_time"],
      week: {
        availability: "available",
        coverage: "provider_top_100",
        items: rankingItems("week", "Weekly"),
        totalAvailable: 100
      }
    },
    dataConfig: { publicLimit: 12, publicRanges: ["week", "all_time"] },
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
  return Array.from({ length: 12 }, (_, index) =>
    rankingItem(
      `${idPrefix}-${index + 1}`,
      index === 0 ? `${namePrefix} One` : `${namePrefix} ${index + 1}`,
      index + 1,
      88 - index * 4
    )
  );
}

function track(id: string, name: string) {
  return {
    albumName: "Fixture Album",
    artists: [{ name: "Fixture Artist", providerArtistId: "artist-1" }],
    coverUrl: null,
    durationMs: 240_000,
    name,
    providerTrackId: id
  };
}
