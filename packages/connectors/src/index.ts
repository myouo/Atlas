import type { ProviderType } from "@nivalis/domain";

export interface ProviderCapabilities {
  readonly activities: boolean;
  readonly profile: boolean;
}

export interface SyncContext {
  readonly connectionId: string;
  readonly requestedAt: Date;
}

export interface ProviderConnector {
  readonly provider: ProviderType;
  getCapabilities(): ProviderCapabilities;
  syncProfile(context: SyncContext): Promise<void>;
}

export const connectorImplementations = [] as const;
