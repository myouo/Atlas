// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ProviderConnectionService } from "@nivalis/application";
import { providerProtocolMetadata } from "@nivalis/domain";
import {
  createSteamFixtureFetcher,
  steamFixtureId,
  type SteamFixtureScenario
} from "../../../../../packages/connectors/src/steam/fixtures";
import { D1ProviderSyncRuntime } from "./d1-provider-sync";
import {
  D1ProviderCredentialRepository,
  D1ProviderConnectionUnitOfWork
} from "./d1-provider-credential-repository";
import { WebCryptoSecretProtector } from "./web-crypto-auth";
import type { CloudflareQueueMessage } from "./cloudflare-sync-queue";

const directory = "infra/providers/cloudflare/edge/migrations";
const owner = "00000000-0000-4000-8000-000000000001";
const apiKey = "a".repeat(32);
const now = new Date("2026-09-06T00:00:00.000Z");

function database(through = 9) {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= through)
    .sort()) {
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(`${directory}/${file}`, "utf8"));
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  sqlite.exec(readFileSync("infra/providers/cloudflare/edge/seed.sql", "utf8"));
  return sqlite;
}

// Execute the actual adapter SQL on SQLite, including rollback and foreign keys.
class SqliteD1 implements D1Database {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string): D1PreparedStatement {
    return new Statement(this.sqlite, sql);
  }
  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.all<T>());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }
  async dump(): Promise<ArrayBuffer> {
    throw new Error("Unused by this test");
  }
  withSession(): D1DatabaseSession {
    return {
      prepare: (sql) => this.prepare(sql),
      batch: (statements) => this.batch(statements),
      getBookmark: () => null
    };
  }
}
class Statement implements D1PreparedStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly values: SQLInputValue[] = []
  ) {}
  bind(...values: unknown[]) {
    return new Statement(
      this.sqlite,
      this.sql,
      values.map((value) => {
        if (
          value === null ||
          typeof value === "number" ||
          typeof value === "string" ||
          typeof value === "bigint"
        )
          return value;
        if (ArrayBuffer.isView(value))
          return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        throw new Error("Unsupported SQLite bind value");
      })
    );
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.values);
    return (row ? (column ? row[column] : row) : null) as T | null;
  }
  async all<T>(): Promise<D1Result<T>> {
    const rows = this.sqlite.prepare(this.sql).all(...this.values);
    return {
      results: rows as T[],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: rows.length,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: Number(this.sqlite.prepare("SELECT changes() AS n").get()?.n ?? 0)
      }
    };
  }
  async run<T>(): Promise<D1Result<T>> {
    return this.all<T>();
  }
  raw<T>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const rows = this.sqlite.prepare(this.sql).all(...this.values);
    const values = rows.map((row) => Object.values(row)) as T[];
    return options?.columnNames ? [rows[0] ? Object.keys(rows[0]) : [], ...values] : values;
  }
}

describe("Steam D1 integration", () => {
  it("preserves the legacy FK graph, credentials, evidence and immutable snapshots during upgrade", async () => {
    const sqlite = database(8);
    try {
      sqlite.exec(`INSERT INTO provider_connections VALUES ('legacy','${owner}','netease','old-account',1,'old','old');
        INSERT INTO provider_sync_runs (id,owner_id,provider,status,requested_at,provider_connection_id) VALUES ('legacy-run','${owner}','netease','completed','old','legacy');
        INSERT INTO provider_raw_snapshots (id,sync_run_id,provider_connection_id,provider,source_kind,schema_version,payload_json,payload_hash,fetched_at,created_at) VALUES ('legacy-raw','legacy-run','legacy','netease','netease.account',1,'{}','hash','old','old');
        INSERT INTO netease_accounts VALUES ('legacy','old-account','Existing User','old');
        INSERT INTO provider_sync_states (provider_connection_id,provider,status,updated_at) VALUES ('legacy','netease','completed','old');
        INSERT INTO provider_data_catalogs VALUES ('legacy','netease',1,'old-version','{}','old');`);
      const normalized = {
        data: {},
        meta: {
          ...providerProtocolMetadata("normalization.result", "netease", "legacy-run"),
          schemaId: "urn:nivalis:provider:netease:normalized",
          schemaVersion: 1
        }
      };
      sqlite
        .prepare("INSERT INTO provider_normalized_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(
          "legacy-normalized",
          "legacy-run",
          "legacy",
          "netease",
          "2.0",
          "urn:nivalis:provider:netease:normalized",
          1,
          JSON.stringify(normalized),
          "old"
        );
      const protector = new WebCryptoSecretProtector(new Uint8Array(32).fill(7), "test");
      const repo = new D1ProviderCredentialRepository(new SqliteD1(sqlite));
      await repo.save({
        credentialType: "music_u",
        now,
        providerConnectionId: "legacy",
        status: "valid",
        protectedSecret: await protector.protect("legacy-test-secret", {
          credentialType: "music_u",
          ownerId: owner,
          purpose: "provider_credential",
          subjectId: "legacy"
        })
      });
      const tables = [
        "provider_connections",
        "provider_credentials",
        "provider_sync_runs",
        "provider_sync_states",
        "provider_raw_snapshots",
        "provider_normalized_snapshots",
        "provider_data_catalogs",
        "netease_accounts"
      ];
      const before = tables.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all());
      sqlite.exec("BEGIN");
      sqlite.exec(readFileSync(`${directory}/0009_steam_provider.sql`, "utf8"));
      sqlite.exec("COMMIT");
      expect(tables.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(() =>
        sqlite.exec("UPDATE provider_normalized_snapshots SET schema_version=2")
      ).toThrow("immutable");
      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '_steam_backup_%'").all()
      ).toEqual([]);
      await expect(
        repo.upsertForOwner({ ownerId: owner, provider: "steam", now })
      ).resolves.toHaveProperty("id");
    } finally {
      sqlite.close();
    }
  });

  it("connects, queues, persists and projects Steam; failures preserve last-known-good data", async () => {
    const sqlite = database();
    try {
      const db = new SqliteD1(sqlite);
      const protector = new WebCryptoSecretProtector(new Uint8Array(32).fill(7), "test");
      const metrics = { backlogCount: 0, backlogBytes: 0 };
      const send = vi.fn(async () => ({ metadata: { metrics } }));
      const queue: Queue<CloudflareQueueMessage> = {
        send,
        sendBatch: async () => ({ metadata: { metrics } }),
        metrics: async () => metrics
      };
      let scenario: SteamFixtureScenario = "normal";
      const runtime = new D1ProviderSyncRuntime(db, queue, protector, 100, 3, (input, init) =>
        createSteamFixtureFetcher(scenario)(input, init)
      );
      const repo = new D1ProviderCredentialRepository(db);
      const connections = new ProviderConnectionService(
        repo,
        new D1ProviderConnectionUnitOfWork(db),
        protector,
        { now: () => new Date() },
        (context, provider) => runtime.enqueue(context.actorId, provider)
      );
      sqlite.exec(
        `UPDATE dashboard_revision_widgets SET provider='steam',schema_version=2,data_config_json='{"shareRecentGames":true}' WHERE widget_type='steam.profile'`
      );
      const accepted = await connections.connectSteam({ actorId: owner }, steamFixtureId, apiKey);
      expect(accepted.connection.provider).toBe("steam");
      expect(accepted.connection.credentialStatus).toBe("pending_validation");
      expect(send).toHaveBeenCalledOnce();
      const reused = await runtime.enqueue(owner, "steam");
      expect(reused.id).toBe(accepted.validationJob.id);
      const completed = await runtime.process(accepted.validationJob.id);
      expect(completed.run.status).toBe("completed");
      expect(await connections.getSteam({ actorId: owner })).toMatchObject({
        credentialStatus: "valid",
        providerAccountId: steamFixtureId,
        displayName: "Steam Fixture"
      });
      const projections = sqlite
        .prepare("SELECT data_json FROM widget_projections WHERE provider='steam'")
        .all();
      expect(projections).toHaveLength(1);
      expect(JSON.parse(String(projections[0]?.data_json))).toMatchObject({
        library: { gameCount: 2, playtimeMinutes: 125 },
        recentGames: { items: [{ appId: 10 }, { appId: 20 }] }
      });
      expect(
        sqlite.prepare("SELECT id FROM provider_raw_snapshots WHERE provider='steam'").all()
      ).toHaveLength(4);
      expect(
        sqlite.prepare("SELECT id FROM provider_normalized_snapshots WHERE provider='steam'").all()
      ).toHaveLength(1);
      scenario = "invalid_key";
      const next = await runtime.enqueue(owner, "steam");
      expect((await runtime.process(next.id)).run.status).toBe("failed");
      expect(
        sqlite.prepare("SELECT data_json FROM widget_projections WHERE provider='steam'").all()
      ).toEqual(projections);
      await connections.disconnectSteam({ actorId: owner });
      expect(await connections.getSteam({ actorId: owner })).toMatchObject({
        configured: false,
        enabled: false,
        providerAccountId: null
      });
      expect(sqlite.prepare("SELECT id FROM provider_credentials").all()).toEqual([]);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
