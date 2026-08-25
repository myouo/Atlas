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

  it("renders a curated multi-item showcase without auto-selecting history", () => {
    render(<NeteaseShowcaseWidget widget={showcaseWidget()} />);
    expect(screen.getByText("Curated Song")).toBeInTheDocument();
    expect(screen.getByText("Curated Playlist")).toBeInTheDocument();
    expect(screen.getByText("Curated Medal")).toBeInTheDocument();
    expect(screen.getByText("累计播放时间")).toBeInTheDocument();
    expect(screen.queryByText(/历史第一/)).not.toBeInTheDocument();
  });
});

function rankingWidget(): Extract<WidgetOf<"music.netease.ranking">, { schemaVersion: 2 }> {
  return {
    data: {
      allTime: {
        availability: "available",
        coverage: "provider_top_100",
        items: [rankingItem("all-1", "All-time One", 1, 88)],
        totalAvailable: 100
      },
      provider: "netease",
      publicLimit: 12,
      publicRanges: ["week", "all_time"],
      week: {
        availability: "available",
        coverage: "provider_top_100",
        items: [rankingItem("week-1", "Weekly One", 1, 12)],
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
