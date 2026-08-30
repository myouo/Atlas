import type { ProviderAuthJobQueue, SyncJobQueue } from "@nivalis/application";

export interface CloudflareSyncMessage {
  readonly kind: "sync";
  readonly queueJobId: string;
  readonly syncRunId: string;
}

export interface CloudflareProviderAuthMessage {
  readonly attemptId: string;
  readonly kind: "provider_auth";
  readonly queueJobId: string;
}

export type CloudflareQueueMessage = CloudflareProviderAuthMessage | CloudflareSyncMessage;

export class CloudflareSyncJobQueue implements SyncJobQueue {
  constructor(private readonly queue: Queue<CloudflareQueueMessage>) {}

  async enqueue(syncRunId: string) {
    const queueJobId = crypto.randomUUID();
    await this.queue.send({ kind: "sync", queueJobId, syncRunId }, { contentType: "json" });
    return queueJobId;
  }
}

export class CloudflareProviderAuthJobQueue implements ProviderAuthJobQueue {
  constructor(private readonly queue: Queue<CloudflareQueueMessage>) {}

  async enqueue(attemptId: string, delaySeconds = 0) {
    const queueJobId = crypto.randomUUID();
    await this.queue.send(
      { attemptId, kind: "provider_auth", queueJobId },
      { contentType: "json", delaySeconds }
    );
    return queueJobId;
  }
}

export async function consumeQueueMessages(
  batch: MessageBatch<CloudflareQueueMessage>,
  database: D1Database,
  handlers: {
    readonly providerAuth: (attemptId: string) => Promise<void>;
    readonly sync: (syncRunId: string) => Promise<"busy" | "processed">;
  }
) {
  for (const message of batch.messages) {
    try {
      await database
        .prepare(
          `INSERT INTO queue_deliveries
             (message_id, queue_job_id, sync_run_id, attempts, received_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(message_id) DO UPDATE SET
             attempts = excluded.attempts,
             received_at = excluded.received_at`
        )
        .bind(
          message.id,
          message.body.queueJobId,
          message.body.kind === "provider_auth"
            ? `provider-auth:${message.body.attemptId}`
            : message.body.syncRunId,
          message.attempts,
          new Date().toISOString()
        )
        .run();
      if (message.body.kind === "provider_auth") {
        await handlers.providerAuth(message.body.attemptId);
      } else {
        const disposition = await handlers.sync(message.body.syncRunId);
        if (disposition === "busy") {
          message.retry({ delaySeconds: 15 });
          continue;
        }
      }
      message.ack();
    } catch {
      if (message.attempts >= 3) message.ack();
      else message.retry({ delaySeconds: Math.min(30 * 2 ** message.attempts, 300) });
    }
  }
}
