import { ProviderDataNotFoundError } from "@nivalis/domain";
import type { OwnerContext } from "@nivalis/domain";

import type { ProviderDataCatalogReader } from "../ports/provider-data";

export class ProviderDataService {
  constructor(private readonly catalogs: ProviderDataCatalogReader) {}

  async getNeteaseCatalog(context: OwnerContext) {
    const catalog = await this.catalogs.findForOwner(context.actorId, "netease");
    if (!catalog) throw new ProviderDataNotFoundError("netease");
    if (catalog.schemaVersion !== 1) throw new ProviderDataNotFoundError("netease");
    return { ...catalog, provider: "netease" as const, schemaVersion: 1 as const };
  }
}
