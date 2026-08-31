import { describe, expect, it, vi } from "vitest";

import {
  CloudflareProviderAuthJobQueue,
  CloudflareSyncJobQueue,
  consumeQueueMessages
} from "./cloudflare-sync-queue";

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

  it("uses a preallocated Queue identity already persisted with the SyncRun", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const adapter = new CloudflareSyncJobQueue({ send } as unknown as Queue);
    const queueJobId = "00000000-0000-4000-8000-000000000709";

    await expect(adapter.enqueue("00000000-0000-4000-8000-000000000710", queueJobId)).resolves.toBe(
      queueJobId
    );
    expect(send).toHaveBeenCalledWith(
      {
        kind: "sync",
        queueJobId,
        syncRunId: "00000000-0000-4000-8000-000000000710"
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

  it("retries a durable Sync message while the HTTP fast path owns its lease", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const message = {
      ack,
      attempts: 1,
      body: {
        kind: "sync",
        queueJobId: "00000000-0000-4000-8000-000000000703",
        syncRunId: "00000000-0000-4000-8000-000000000704"
      },
      id: "queue-message",
      retry
    };
    const run = vi.fn().mockResolvedValue({ success: true });
    const database = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run })) }))
    } as unknown as D1Database;

    await consumeQueueMessages(
      { messages: [message] } as unknown as MessageBatch<never>,
      database,
      {
        providerAuth: async () => undefined,
        sync: async () => "busy"
      }
    );

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 15 });
    expect(ack).not.toHaveBeenCalled();
  });

  it("acknowledges a Sync message after processing or terminal replay", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const message = {
      ack,
      attempts: 1,
      body: {
        kind: "sync",
        queueJobId: "00000000-0000-4000-8000-000000000705",
        syncRunId: "00000000-0000-4000-8000-000000000706"
      },
      id: "queue-message",
      retry
    };
    const database = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({ success: true }) }))
      }))
    } as unknown as D1Database;

    await consumeQueueMessages(
      { messages: [message] } as unknown as MessageBatch<never>,
      database,
      {
        providerAuth: async () => undefined,
        sync: async () => "processed"
      }
    );

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
