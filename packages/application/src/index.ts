import type { ProviderSyncJobIdentity, ProviderType } from "@nivalis/domain";

export interface EnqueueProviderSync {
  enqueue(provider: ProviderType): Promise<ProviderSyncJobIdentity>;
}

export interface Clock {
  now(): Date;
}

export const applicationPhase = "ports-only" as const;
