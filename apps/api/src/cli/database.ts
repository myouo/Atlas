import process from "node:process";

import { loadApiConfig } from "../config/api-config";
import { loadRootEnvironment } from "../config/load-root-env";
import { createDatabase } from "../infrastructure/database/database";
import { createMigrator } from "../infrastructure/database/migrator";
import { seedPhaseFiveFixture } from "../infrastructure/database/seed";

type DatabaseCommand = "migrate" | "status" | "rollback" | "seed";

loadRootEnvironment();

async function main() {
  const command = process.argv[2] as DatabaseCommand | undefined;
  if (!command || !["migrate", "status", "rollback", "seed"].includes(command)) {
    write({ error: "Expected one of: migrate, status, rollback, seed" }, true);
    process.exitCode = 1;
    return;
  }

  const config = loadApiConfig();
  if (command === "seed" && config.nodeEnv === "production") {
    throw new Error("The Phase 5 development Fixture Seed is disabled in production.");
  }
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databaseMaxConnections,
    ssl: config.databaseSsl
  });

  try {
    const migrator = createMigrator(database);
    if (command === "migrate") {
      const result = await migrator.migrateToLatest();
      if (result.error) throw result.error;
      write({ command, migrations: result.results ?? [] });
      return;
    }
    if (command === "rollback") {
      const result = await migrator.migrateDown();
      if (result.error) throw result.error;
      write({ command, migrations: result.results ?? [] });
      return;
    }
    if (command === "status") {
      const migrations = await migrator.getMigrations();
      write({
        command,
        migrations: migrations.map((migration) => ({
          executedAt: migration.executedAt?.toISOString() ?? null,
          name: migration.name,
          status: migration.executedAt ? "applied" : "pending"
        }))
      });
      return;
    }
    await seedPhaseFiveFixture(database);
    write({ command, fixture: "phase-five", status: "seeded" });
  } finally {
    await database.destroy();
  }
}

function write(value: unknown, stderr = false) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  (stderr ? process.stderr : process.stdout).write(output);
}

main().catch((error: unknown) => {
  write(
    {
      error: "Database command failed.",
      message: error instanceof Error ? error.message : "Unknown error"
    },
    true
  );
  process.exitCode = 1;
});
