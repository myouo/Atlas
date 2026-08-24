import type { ProviderDataCatalogReader, ProviderDataCatalogRecord } from "@nivalis/application";
import type { ProviderType } from "@nivalis/domain";
import type { Kysely } from "kysely";

import type { Database } from "../database/schema";

export class KyselyProviderDataCatalogReader implements ProviderDataCatalogReader {
  constructor(private readonly database: Kysely<Database>) {}

  async findForOwner(
    ownerId: string,
    provider: ProviderType
  ): Promise<ProviderDataCatalogRecord | null> {
    if (provider !== "netease") return null;
    const row = await this.database
      .selectFrom("provider_data_catalogs as catalog")
      .innerJoin(
        "provider_connections as connection",
        "connection.id",
        "catalog.provider_connection_id"
      )
      .select([
        "catalog.data",
        "catalog.data_version_id",
        "catalog.generated_at",
        "catalog.provider",
        "catalog.schema_version"
      ])
      .where("connection.owner_id", "=", ownerId)
      .where("connection.provider", "=", provider)
      .executeTakeFirst();
    return row
      ? {
          catalog: row.data,
          dataVersion: row.data_version_id,
          generatedAt: row.generated_at,
          provider: row.provider,
          schemaVersion: row.schema_version
        }
      : null;
  }
}
