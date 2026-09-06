import { randomUUID } from "node:crypto";
import type { ProviderNativeStore } from "@nivalis/application";
import { ProjectionError } from "@nivalis/domain";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../database/schema";

export class KyselySteamCatalogStore implements ProviderNativeStore {
  readonly provider = "steam" as const;
  constructor(private readonly database: Kysely<Database> | Transaction<Database>) {}

  async persist(input: Parameters<ProviderNativeStore["persist"]>[0]) {
    const account = input.normalized.data.account;
    if (
      input.normalized.meta.provider !== "steam" ||
      !account ||
      typeof account !== "object" ||
      Array.isArray(account) ||
      !("steamId" in account) ||
      typeof account.steamId !== "string"
    ) {
      throw new ProjectionError("Cannot persist invalid Steam normalized data.");
    }
    await this.database
      .updateTable("provider_connections")
      .set({ account_key: account.steamId, updated_at: input.generatedAt })
      .where("id", "=", input.providerConnectionId)
      .where("provider", "=", "steam")
      .execute();
    const row = {
      data: JSON.stringify(input.normalized.data),
      data_version_id: randomUUID(),
      generated_at: input.generatedAt,
      provider: this.provider,
      provider_connection_id: input.providerConnectionId,
      schema_version: input.normalized.meta.schemaVersion
    };
    await this.database
      .insertInto("provider_data_catalogs")
      .values(row)
      .onConflict((conflict) => conflict.column("provider_connection_id").doUpdateSet(row))
      .execute();
  }
}
