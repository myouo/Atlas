import { expect, it } from "vitest";

import { mergeCalendarHistory } from "./d1-dashboard-read-adapter";

it("merges every archived period in date order without exposing unpublished ranges", () => {
  const history: {
    created_at: string;
    period: "week" | "month";
    range_json: string;
    start_time: number;
  }[] = Array.from({ length: 8 }, (_, index) => ({
    created_at: "2026-09-25T00:00:00.000Z",
    period: "week" as const,
    range_json: JSON.stringify({
      availability: "available",
      points: [
        {
          date: new Date(Date.UTC(2026, 8, 14 - index * 7)).toISOString().slice(0, 10),
          minutes: 10
        }
      ]
    }),
    start_time: Date.UTC(2026, 8, 14 - index * 7)
  }));
  history.push({
    created_at: "2026-09-25T00:00:00.000Z",
    period: "month",
    range_json: JSON.stringify({
      availability: "available",
      points: [{ date: "2026-08-01", minutes: 20 }]
    }),
    start_time: Date.UTC(2026, 7, 1)
  });
  const merged = mergeCalendarHistory(
    {
      publicRanges: ["week"],
      weekHistory: [{ availability: "available", points: [{ date: "2026-09-14", minutes: 10 }] }],
      monthHistory: []
    },
    history,
    [{ complete: 0, period: "week" }],
    ["week"]
  ) as Record<string, unknown>;

  const weeks = merged.weekHistory as { points: { date: string }[] }[];
  expect(weeks).toHaveLength(8);
  expect(weeks[0]?.points[0]?.date).toBe("2026-09-14");
  expect(weeks.at(-1)?.points[0]?.date).toBe("2026-07-27");
  expect(merged.monthHistory).toEqual([]);
  expect(merged.historyBackfill).toEqual({ monthComplete: false, weekComplete: false });
});
