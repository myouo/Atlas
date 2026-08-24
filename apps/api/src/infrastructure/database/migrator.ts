import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

import { FileMigrationProvider, Migrator } from "kysely/migration";

import type { NivalisDatabase } from "./database";

const migrationFolder = resolveMigrationFolder();

export function createMigrator(database: NivalisDatabase) {
  return new Migrator({
    db: database,
    provider: new FileMigrationProvider({
      fs,
      migrationFolder,
      path
    })
  });
}

function resolveMigrationFolder() {
  const roots = [process.env.INIT_CWD, process.cwd(), path.resolve(process.cwd(), "../..")].filter(
    (value): value is string => Boolean(value)
  );
  for (const root of roots) {
    const candidate = path.join(root, "migrations");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("The repository migrations directory could not be located.");
}
