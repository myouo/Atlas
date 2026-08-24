import { createDatabase } from "../infrastructure/database/database";

export function createTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
  }
  const databaseName = new URL(connectionString).pathname.slice(1);
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      "Integration tests refuse to run against a database without 'test' in its name."
    );
  }
  return createDatabase({ connectionString, maxConnections: 4 });
}
