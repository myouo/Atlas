import { historicalListenReportFixture, historicalReportState } from "@nivalis/connectors";
import { expect, it, vi } from "vitest";

import { collectNeteaseCalendarHistoryBatch } from "./netease-calendar-backfill";

it("continues bounded batches until the account's earliest historical week", async () => {
  const reports = Array.from({ length: 18 }, (_, index) =>
    historicalListenReportFixture("week", index)
  );
  const first = historicalReportState(reports[0]!);
  const last = historicalReportState(reports.at(-1)!);
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  const getHistoricalListenReport = vi.fn(async () => reports.shift()!);
  const save = vi.fn(async () => undefined);
  const input = {
    accountCreatedAt: last!.startTime,
    client: { getHistoricalListenReport },
    credential: "fixture-credential",
    period: "week" as const,
    save
  };

  const firstBatch = await collectNeteaseCalendarHistoryBatch({
    ...input,
    nextEndTime: first!.endTime + 1
  });
  expect(firstBatch.complete).toBe(false);
  expect(save).toHaveBeenCalledTimes(16);

  const secondBatch = await collectNeteaseCalendarHistoryBatch({
    ...input,
    nextEndTime: firstBatch.nextEndTime
  });
  expect(secondBatch.complete).toBe(true);
  expect(save).toHaveBeenCalledTimes(18);
  expect(getHistoricalListenReport).toHaveBeenCalledTimes(18);
});

it("can resume from the last persisted period after a Provider request fails", async () => {
  const reports = Array.from({ length: 6 }, (_, index) =>
    historicalListenReportFixture("week", index)
  );
  const first = historicalReportState(reports[0]!)!;
  const last = historicalReportState(reports.at(-1)!)!;
  let nextIndex = 0;
  let failOnce = true;
  let persistedCursor = first.endTime + 1;
  const getHistoricalListenReport = vi.fn(async () => {
    if (nextIndex === 4 && failOnce) {
      failOnce = false;
      throw new Error("temporary Provider failure");
    }
    return reports[nextIndex++]!;
  });
  const save = vi.fn(async (_state: unknown, _range: unknown, cursor: number) => {
    persistedCursor = cursor;
  });
  const input = {
    accountCreatedAt: last.startTime,
    client: { getHistoricalListenReport },
    credential: "fixture-credential",
    period: "week" as const,
    save
  };

  await expect(
    collectNeteaseCalendarHistoryBatch({ ...input, nextEndTime: persistedCursor })
  ).rejects.toThrow("temporary Provider failure");
  expect(save).toHaveBeenCalledTimes(4);

  const resumed = await collectNeteaseCalendarHistoryBatch({
    ...input,
    nextEndTime: persistedCursor
  });
  expect(resumed.complete).toBe(true);
  expect(save).toHaveBeenCalledTimes(6);
});
