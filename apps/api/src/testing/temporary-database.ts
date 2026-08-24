import { randomUUID } from "node:crypto";

import { Client } from "pg";

export interface TemporaryDatabase {
  readonly connectionString: string;
  drop(): Promise<void>;
}

export async function createTemporaryMigrationDatabase(): Promise<TemporaryDatabase> {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is required for migration tests.");

  const name = `nivalis_phase4_migration_test_${process.pid}_${randomUUID().replaceAll("-", "")}`;
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Unsafe temporary database name.");
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";
  const databaseUrl = new URL(base);
  databaseUrl.pathname = `/${name}`;

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  return {
    connectionString: databaseUrl.toString(),
    async drop() {
      const cleanup = new Client({ connectionString: adminUrl.toString() });
      await cleanup.connect();
      try {
        await cleanup.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await cleanup.end();
      }
    }
  };
}
