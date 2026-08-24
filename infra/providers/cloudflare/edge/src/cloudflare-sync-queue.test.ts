import { describe, expect, it, vi } from "vitest";

import { CloudflareSyncJobQueue } from "./cloudflare-sync-queue";

describe("CloudflareSyncJobQueue", () => {
  it("keeps Cloudflare message details behind the Application queue port", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const adapter = new CloudflareSyncJobQueue({ send } as unknown as Queue);

    const queueJobId = await adapter.enqueue("00000000-0000-4000-8000-000000000701");

    expect(queueJobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(send).toHaveBeenCalledWith(
      {
        queueJobId,
        syncRunId: "00000000-0000-4000-8000-000000000701"
      },
      { contentType: "json" }
    );
  });
});
