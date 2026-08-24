import { ProviderNotConfiguredError, SyncRunNotFoundError } from "@nivalis/domain";
import type { OwnerContext, ProviderStatus, ProviderType, SyncRun } from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { SyncEnqueueUnitOfWork, SyncRepository } from "../ports/sync-runtime";

const providers: readonly ProviderType[] = [
  "fixture",
  "netease",
  "github",
  "bangumi",
  "steam",
  "bilibili"
];

export class SyncService {
  constructor(
    private readonly repository: SyncRepository,
    private readonly enqueueUnitOfWork: SyncEnqueueUnitOfWork,
    private readonly clock: Clock,
    private readonly providerAvailable: (provider: ProviderType) => boolean = () => true
  ) {}

  async enqueue(context: OwnerContext, provider: ProviderType): Promise<SyncRun> {
    if (!this.providerAvailable(provider)) throw new ProviderNotConfiguredError(provider);
    return this.enqueueUnitOfWork.run(async (repository, queue) => {
      const connection = await repository.findConnectionForOwnerProvider(context.actorId, provider);
      if (!connection?.enabled) throw new ProviderNotConfiguredError(provider);
      const result = await repository.createOrGetActiveRun(connection, this.clock.now());
      if (!result.created) return result.run;
      const queueJobId = await queue.enqueue(result.run.id);
      return repository.attachQueueJob(result.run.id, queueJobId, this.clock.now());
    });
  }

  async getRun(context: OwnerContext, syncRunId: string): Promise<SyncRun> {
    const run = await this.repository.getRunForOwner(context.actorId, syncRunId);
    if (!run) throw new SyncRunNotFoundError(syncRunId);
    return run;
  }

  async listProviderStatus(context: OwnerContext): Promise<readonly ProviderStatus[]> {
    const states = await this.repository.listProviderStates(context.actorId);
    const byProvider = new Map(
      states
        .filter((state) => this.providerAvailable(state.provider))
        .map((state) => [state.provider, state])
    );
    return providers.filter(this.providerAvailable).map((provider) => {
      const state = byProvider.get(provider);
      return {
        attemptCount: state?.attemptCount ?? 0,
        connection: !state
          ? "not_connected"
          : !state.connectionEnabled
            ? "disabled"
            : state.credentialStatus === "expired" || state.credentialStatus === "invalid"
              ? "requires_attention"
              : provider === "fixture"
                ? state
                  ? "fixture"
                  : "not_connected"
                : "connected",
        credentialStatus: state?.credentialStatus ?? "not_configured",
        lastAttemptAt: state?.lastAttemptAt ?? null,
        lastErrorCode: state?.lastErrorCode ?? null,
        lastErrorMessage: state?.lastErrorMessage ?? null,
        lastSuccessAt: state?.lastSuccessAt ?? null,
        provider,
        syncStatus:
          state?.status === "retry_wait"
            ? "retrying"
            : state?.status === "credential_invalid"
              ? "credential_invalid"
              : (state?.status ?? "idle")
      };
    });
  }
}
