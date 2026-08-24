import { InvalidProviderCredentialError, ProviderConnectionNotFoundError } from "@nivalis/domain";
import type {
  OwnerContext,
  ProviderConnectionView,
  ProviderCredentialType,
  SyncRun
} from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type {
  ProviderConnectionRepository,
  ProviderConnectionUnitOfWork,
  SecretProtector
} from "../ports/credentials";

export class ProviderConnectionService {
  constructor(
    private readonly connections: ProviderConnectionRepository,
    private readonly unitOfWork: ProviderConnectionUnitOfWork,
    private readonly secrets: SecretProtector,
    private readonly clock: Clock,
    private readonly enqueueSync: (context: OwnerContext, provider: "netease") => Promise<SyncRun>
  ) {}

  list(context: OwnerContext): Promise<readonly ProviderConnectionView[]> {
    return this.connections.listForOwner(context.actorId);
  }

  getNetease(context: OwnerContext): Promise<ProviderConnectionView> {
    return this.connections.getForOwner(context.actorId, "netease");
  }

  async connectNetease(
    context: OwnerContext,
    credentialType: ProviderCredentialType,
    credential: string
  ) {
    return this.connectNeteaseCredential(context, credentialType, credential);
  }

  async connectNeteaseFromAuthAttempt(
    context: OwnerContext,
    credential: string,
    attemptCreatedAt: Date
  ) {
    return this.connectNeteaseCredential(context, "music_u", credential, attemptCreatedAt);
  }

  private async connectNeteaseCredential(
    context: OwnerContext,
    credentialType: ProviderCredentialType,
    credential: string,
    acquiredFromAttemptAt?: Date
  ) {
    const trimmed = credential.trim();
    if (credentialType !== "music_u" || trimmed.length < 16 || trimmed.length > 4_096) {
      throw new InvalidProviderCredentialError();
    }
    const now = this.clock.now();
    const connection = await this.unitOfWork.run(async (connections, credentials) => {
      const current = await connections.upsertForOwner({
        ...(acquiredFromAttemptAt ? { acquiredFromAttemptAt } : {}),
        now,
        ownerId: context.actorId,
        provider: "netease"
      });
      const protectedSecret = await this.secrets.protect(trimmed, {
        credentialType,
        ownerId: context.actorId,
        purpose: "provider_credential",
        subjectId: current.id
      });
      await credentials.save({
        credentialType,
        now,
        protectedSecret,
        providerConnectionId: current.id,
        status: "pending_validation"
      });
      return current;
    });
    const validationJob = await this.enqueueSync(context, "netease");
    return {
      connection: await this.connections.getForOwner(context.actorId, "netease"),
      providerConnectionId: connection.id,
      validationJob
    };
  }

  async disconnectNetease(context: OwnerContext) {
    const disabled = await this.unitOfWork.run(async (connections, credentials) => {
      const view = await connections.getForOwner(context.actorId, "netease");
      if (!view.configured && !view.enabled) return false;
      const connection = await connections.upsertForOwner({
        now: this.clock.now(),
        ownerId: context.actorId,
        provider: "netease"
      });
      await credentials.delete(connection.id, "music_u");
      return connections.disableForOwner(context.actorId, "netease", this.clock.now());
    });
    if (!disabled) throw new ProviderConnectionNotFoundError("netease");
  }
}
