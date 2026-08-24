import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "./schema";

export interface DatabaseOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly ssl?: boolean;
}

export function createDatabase(options: DatabaseOptions): Kysely<Database> {
  const pool = new Pool({
    connectionString: options.connectionString,
    connectionTimeoutMillis: 5_000,
    max: options.maxConnections ?? 10,
    ...(options.ssl ? { ssl: { rejectUnauthorized: true } } : {})
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool })
  });
}

export type NivalisDatabase = Kysely<Database>;
