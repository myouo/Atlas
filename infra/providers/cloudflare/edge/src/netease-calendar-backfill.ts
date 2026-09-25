import {
  historicalReportState,
  NeteaseClient,
  normalizeNeteaseHistoricalReport,
  previousPeriodEndTime,
  projectNeteaseHistoricalCalendarRange
} from "@nivalis/connectors";

import type { CloudflareQueueMessage } from "./cloudflare-sync-queue";
import { providerFetcher, type ProviderEnvironment } from "./cloudflare-provider-runtime";
import {
  D1ProviderCredentialRepository,
  D1ProviderCredentialResolver
} from "./d1-provider-credential-repository";
import { decodeBase64UrlKey, WebCryptoSecretProtector } from "./web-crypto-auth";

export type CalendarPeriod = "week" | "month";

interface BackfillRow {
  readonly account_created_at: number | null;
  readonly complete: number;
  readonly next_end_time: number | null;
}

const PERIODS_PER_MESSAGE = 16;
const LEASE_MS = 15 * 60_000;

export class NeteaseCalendarBackfill {
  private readonly client: NeteaseClient;
  private readonly credentials: D1ProviderCredentialResolver | null;

  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareQueueMessage>,
    environment: ProviderEnvironment
  ) {
    this.client = new NeteaseClient(
      { timeoutMs: Number(environment.NETEASE_REQUEST_TIMEOUT_MS) || 12_000 },
      providerFetcher(environment)
    );
    const masterKey = environment.NIVALIS_CREDENTIAL_MASTER_KEY?.trim();
    this.credentials = masterKey
      ? new D1ProviderCredentialResolver(
          new D1ProviderCredentialRepository(database),
          new WebCryptoSecretProtector(
            decodeBase64UrlKey(masterKey),
            environment.NIVALIS_CREDENTIAL_KEY_ID?.trim() || "primary"
          )
        )
      : null;
  }

  async enqueue(connectionId: string, period: CalendarPeriod, delaySeconds = 0) {
    await this.queue.send(
      { connectionId, kind: "netease_calendar_backfill", period, queueJobId: crypto.randomUUID() },
      { contentType: "json", delaySeconds }
    );
  }

  async process(connectionId: string, period: CalendarPeriod): Promise<"busy" | "processed"> {
    if (!this.credentials) throw new Error("Provider credential encryption is not configured.");
    const connection = await this.database
      .prepare(
        "SELECT id FROM provider_connections WHERE id = ? AND provider = 'netease' AND enabled = 1"
      )
      .bind(connectionId)
      .first<{ readonly id: string }>();
    if (!connection) return "processed";

    const now = new Date();
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO netease_calendar_backfill
          (provider_connection_id, period, updated_at)
         VALUES (?, ?, ?)`
      )
      .bind(connectionId, period, now.toISOString())
      .run();
    const leaseToken = crypto.randomUUID();
    const acquired = await this.database
      .prepare(
        `UPDATE netease_calendar_backfill
            SET lease_token = ?, lease_until = ?, updated_at = ?
          WHERE provider_connection_id = ? AND period = ? AND complete = 0
            AND (lease_until IS NULL OR lease_until < ?)`
      )
      .bind(
        leaseToken,
        new Date(now.getTime() + LEASE_MS).toISOString(),
        now.toISOString(),
        connectionId,
        period,
        now.toISOString()
      )
      .run();
    if (acquired.meta.changes === 0) {
      const state = await this.state(connectionId, period);
      return state?.complete ? "processed" : "busy";
    }

    try {
      const state = await this.state(connectionId, period);
      const credential = await this.credentials.resolve(connectionId, "music_u");
      let accountCreatedAt = state?.account_created_at ?? null;
      if (accountCreatedAt === null) {
        const account = await this.database
          .prepare("SELECT provider_user_id FROM netease_accounts WHERE provider_connection_id = ?")
          .bind(connectionId)
          .first<{ readonly provider_user_id: string }>();
        if (account?.provider_user_id) {
          const detail = await this.client.getUserDetail(credential, account.provider_user_id);
          const candidate =
            isObject(detail) && isObject(detail.profile) ? detail.profile.createTime : null;
          if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0) {
            accountCreatedAt = candidate;
          }
        }
      }

      let nextEndTime = state?.next_end_time ?? null;
      if (nextEndTime === null) {
        const current =
          period === "week"
            ? await this.client.getWeeklyListenReport(credential)
            : await this.client.getMonthlyListenReport(credential);
        nextEndTime = previousPeriodEndTime(current);
      }

      const batch = await collectNeteaseCalendarHistoryBatch({
        accountCreatedAt,
        client: this.client,
        credential,
        nextEndTime,
        period,
        save: async (reportState, range, cursor, complete) => {
          const now = new Date().toISOString();
          const statements = [];
          if (range.availability === "available") {
            statements.push(
              this.database
                .prepare(
                  `INSERT OR IGNORE INTO netease_calendar_history
                (provider_connection_id, period, start_time, end_time, range_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`
                )
                .bind(
                  connectionId,
                  period,
                  reportState.startTime,
                  reportState.endTime,
                  JSON.stringify(range),
                  now
                )
            );
          }
          statements.push(
            this.database
              .prepare(
                `UPDATE netease_calendar_backfill
                  SET next_end_time = ?, account_created_at = ?, complete = ?, updated_at = ?
                WHERE provider_connection_id = ? AND period = ? AND lease_token = ?`
              )
              .bind(
                cursor,
                accountCreatedAt,
                complete ? 1 : 0,
                now,
                connectionId,
                period,
                leaseToken
              )
          );
          await this.database.batch(statements);
        }
      });

      await this.database
        .prepare(
          `UPDATE netease_calendar_backfill
              SET next_end_time = ?, account_created_at = ?, complete = ?,
                  lease_token = NULL, lease_until = NULL, updated_at = ?
            WHERE provider_connection_id = ? AND period = ? AND lease_token = ?`
        )
        .bind(
          batch.nextEndTime,
          accountCreatedAt,
          batch.complete ? 1 : 0,
          new Date().toISOString(),
          connectionId,
          period,
          leaseToken
        )
        .run();
      if (!batch.complete) await this.enqueue(connectionId, period, 5);
      return "processed";
    } catch (error) {
      await this.database
        .prepare(
          `UPDATE netease_calendar_backfill
              SET lease_token = NULL, lease_until = NULL, updated_at = ?
            WHERE provider_connection_id = ? AND period = ? AND lease_token = ?`
        )
        .bind(new Date().toISOString(), connectionId, period, leaseToken)
        .run();
      throw error;
    }
  }

  private state(connectionId: string, period: CalendarPeriod) {
    return this.database
      .prepare(
        `SELECT next_end_time, account_created_at, complete
           FROM netease_calendar_backfill
          WHERE provider_connection_id = ? AND period = ?`
      )
      .bind(connectionId, period)
      .first<BackfillRow>();
  }
}

export async function collectNeteaseCalendarHistoryBatch(input: {
  readonly accountCreatedAt: number | null;
  readonly client: Pick<NeteaseClient, "getHistoricalListenReport">;
  readonly credential: string;
  readonly nextEndTime: number | null;
  readonly period: CalendarPeriod;
  readonly save: (
    state: NonNullable<ReturnType<typeof historicalReportState>>,
    range: ReturnType<typeof projectNeteaseHistoricalCalendarRange>,
    nextEndTime: number,
    complete: boolean
  ) => Promise<void>;
}) {
  let nextEndTime = input.nextEndTime;
  let complete = nextEndTime === null;
  for (let index = 0; !complete && index < PERIODS_PER_MESSAGE; index += 1) {
    const report = await input.client.getHistoricalListenReport(
      input.credential,
      input.period,
      nextEndTime!
    );
    const reportState = historicalReportState(report);
    if (!reportState || reportState.period !== input.period) {
      // A changed Provider shape must not be mistaken for the end of history.
      normalizeNeteaseHistoricalReport(report, input.period);
      throw new Error("Historical report has no valid period boundary.");
    }
    if (reportState.startTime >= nextEndTime!) {
      complete = true;
      break;
    }
    const normalized = normalizeNeteaseHistoricalReport(report, input.period);
    const range = projectNeteaseHistoricalCalendarRange(input.period, normalized);
    nextEndTime = reportState.startTime - 1;
    complete =
      nextEndTime <= 1 ||
      (input.accountCreatedAt !== null && reportState.startTime <= input.accountCreatedAt);
    await input.save(reportState, range, nextEndTime, complete);
  }
  return { complete, nextEndTime };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
