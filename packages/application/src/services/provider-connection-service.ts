import {
  InvalidProviderCredentialError,
  ProviderConnectionNotFoundError,
  parseSteamAccountReference
} from "@nivalis/domain";
import type {
  OwnerContext,
  ConnectedProvider,
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
    private readonly enqueueSync: (
      context: OwnerContext,
      provider: ConnectedProvider
    ) => Promise<SyncRun>
  ) {}

  list(context: OwnerContext): Promise<readonly ProviderConnectionView[]> {
    return this.connections.listForOwner(context.actorId);
  }

  getNetease(context: OwnerContext): Promise<ProviderConnectionView> {
    return this.connections.getForOwner(context.actorId, "netease");
  }

  getSteam(context: OwnerContext): Promise<ProviderConnectionView> {
    return this.connections.getForOwner(context.actorId, "steam");
  }

  async connectSteam(context: OwnerContext, steamId: string, apiKey: string) {
    if (typeof steamId !== "string" || typeof apiKey !== "string")
      throw new InvalidProviderCredentialError();
    const reference = parseSteamAccountReference(steamId);
    const id =
      reference.kind === "steam_id"
        ? reference.value
        : `https://steamcommunity.com/id/${reference.value}/`;
    const key = apiKey.trim();
    if (!/^[a-fA-F0-9]{32}$/.test(key)) {
      throw new InvalidProviderCredentialError();
    }
    return this.saveCredential(
      context,
      "steam",
      "steam_web_api",
      JSON.stringify({ steamId: id, apiKey: key })
    );
  }

  async disconnectSteam(context: OwnerContext) {
    return this.disconnect(context, "steam", "steam_web_api");
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
    return this.saveCredential(context, "netease", credentialType, trimmed, acquiredFromAttemptAt);
  }

  private async saveCredential(
    context: OwnerContext,
    provider: ConnectedProvider,
    credentialType: ProviderCredentialType,
    credential: string,
    acquiredFromAttemptAt?: Date
  ) {
    const now = this.clock.now();
    const connection = await this.unitOfWork.run(async (connections, credentials) => {
      const current = await connections.upsertForOwner({
        ...(acquiredFromAttemptAt ? { acquiredFromAttemptAt } : {}),
        now,
        ownerId: context.actorId,
        provider
      });
      const protectedSecret = await this.secrets.protect(credential, {
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
    const validationJob = await this.enqueueSync(context, provider);
    return {
      connection: await this.connections.getForOwner(context.actorId, provider),
      providerConnectionId: connection.id,
      validationJob
    };
  }

  async disconnectNetease(context: OwnerContext) {
    return this.disconnect(context, "netease", "music_u");
  }

  private async disconnect(
    context: OwnerContext,
    provider: ConnectedProvider,
    credentialType: ProviderCredentialType
  ) {
    const disabled = await this.unitOfWork.run(async (connections, credentials) => {
      const view = await connections.getForOwner(context.actorId, provider);
      if (!view.configured && !view.enabled) return false;
      const connection = await connections.upsertForOwner({
        now: this.clock.now(),
        ownerId: context.actorId,
        provider
      });
      await credentials.delete(connection.id, credentialType);
      return connections.disableForOwner(context.actorId, provider, this.clock.now());
    });
    if (!disabled) throw new ProviderConnectionNotFoundError(provider);
  }
}
