import type { ProviderCredentialResolver } from "@nivalis/application";
import type { ProviderRuntimeModule } from "@nivalis/domain";

import { NeteaseClient, type NeteaseClientOptions } from "./netease-client";
import { NeteaseConnector } from "./netease-connector";
import { NeteaseNormalizer } from "./netease-normalizer";
import { NeteaseProjector } from "./netease-projector";

export class NeteaseProviderRuntime implements ProviderRuntimeModule {
  readonly connector: NeteaseConnector;
  readonly normalizer = new NeteaseNormalizer();
  readonly projector = new NeteaseProjector();
  readonly provider = "netease" as const;

  constructor(
    credentials: ProviderCredentialResolver,
    options: NeteaseClientOptions,
    fetcher: typeof fetch = fetch
  ) {
    this.connector = new NeteaseConnector(new NeteaseClient(options, fetcher), credentials);
  }
}
