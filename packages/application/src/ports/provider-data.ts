import type { JsonObject, ProviderType } from "@nivalis/domain";

export interface ProviderDataCatalogRecord {
  readonly catalog: JsonObject;
  readonly dataVersion: string;
  readonly generatedAt: Date;
  readonly provider: ProviderType;
  readonly schemaVersion: number;
}

export interface ProviderDataCatalogReader {
  findForOwner(ownerId: string, provider: ProviderType): Promise<ProviderDataCatalogRecord | null>;
}
