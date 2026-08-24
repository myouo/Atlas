import type { SyncJobQueue } from "@nivalis/application";

export interface CloudflareSyncMessage {
  readonly queueJobId: string;
  readonly syncRunId: string;
}

export class CloudflareSyncJobQueue implements SyncJobQueue {
  constructor(private readonly queue: Queue<CloudflareSyncMessage>) {}

  async enqueue(syncRunId: string) {
    const queueJobId = crypto.randomUUID();
    await this.queue.send({ queueJobId, syncRunId }, { contentType: "json" });
    return queueJobId;
  }
}

export async function consumeSyncMessages(
  batch: MessageBatch<CloudflareSyncMessage>,
  database: D1Database
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
          message.body.syncRunId,
          message.attempts,
          new Date().toISOString()
        )
        .run();
      message.ack();
    } catch {
      if (message.attempts >= 3) message.ack();
      else message.retry({ delaySeconds: Math.min(30 * 2 ** message.attempts, 300) });
    }
  }
}
