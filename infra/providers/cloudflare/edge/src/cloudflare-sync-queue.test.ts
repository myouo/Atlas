import { describe, expect, it, vi } from "vitest";

import { CloudflareProviderAuthJobQueue, CloudflareSyncJobQueue } from "./cloudflare-sync-queue";

describe("CloudflareSyncJobQueue", () => {
  it("keeps Cloudflare message details behind the Application queue port", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const adapter = new CloudflareSyncJobQueue({ send } as unknown as Queue);

    const queueJobId = await adapter.enqueue("00000000-0000-4000-8000-000000000701");

    expect(queueJobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(send).toHaveBeenCalledWith(
      {
        kind: "sync",
        queueJobId,
        syncRunId: "00000000-0000-4000-8000-000000000701"
      },
      { contentType: "json" }
    );
  });

  it("queues only the AuthAttempt identity and never Provider secrets", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const adapter = new CloudflareProviderAuthJobQueue({ send } as unknown as Queue);
    const attemptId = "00000000-0000-4000-8000-000000000702";

    const queueJobId = await adapter.enqueue(attemptId, 2);

    expect(send).toHaveBeenCalledWith(
      { attemptId, kind: "provider_auth", queueJobId },
      { contentType: "json", delaySeconds: 2 }
    );
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/music_u|cookie|credential/i);
  });
});
