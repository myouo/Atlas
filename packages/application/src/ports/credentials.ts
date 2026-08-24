import type {
  CredentialStatus,
  ProtectedSecret,
  ProviderConnectionView,
  ProviderCredentialRecord,
  ProviderCredentialType
} from "@nivalis/domain";

export interface SecretContext {
  readonly credentialType: string;
  readonly ownerId: string;
  readonly purpose: "oauth_pkce" | "provider_auth_attempt" | "provider_credential";
  readonly subjectId: string;
}

export interface SecretProtector {
  protect(secret: string, context: SecretContext): Promise<ProtectedSecret>;
  unprotect(secret: ProtectedSecret, context: SecretContext): Promise<string>;
}

export interface ProviderCredentialStore {
  delete(providerConnectionId: string, credentialType: ProviderCredentialType): Promise<void>;
  get(
    providerConnectionId: string,
    credentialType: ProviderCredentialType
  ): Promise<ProviderCredentialRecord | null>;
  save(input: {
    readonly credentialType: ProviderCredentialType;
    readonly now: Date;
    readonly protectedSecret: ProtectedSecret;
    readonly providerConnectionId: string;
    readonly status: Exclude<CredentialStatus, "not_configured">;
  }): Promise<ProviderCredentialRecord>;
  updateStatus(
    providerConnectionId: string,
    credentialType: ProviderCredentialType,
    status: CredentialStatus,
    now: Date
  ): Promise<void>;
}

export interface ProviderConnectionRepository {
  disableForOwner(ownerId: string, provider: "netease", now: Date): Promise<boolean>;
  getForOwner(ownerId: string, provider: "netease"): Promise<ProviderConnectionView>;
  listForOwner(ownerId: string): Promise<readonly ProviderConnectionView[]>;
  upsertForOwner(input: {
    readonly acquiredFromAttemptAt?: Date;
    readonly now: Date;
    readonly ownerId: string;
    readonly provider: "netease";
  }): Promise<{ readonly id: string }>;
}

export interface ProviderConnectionUnitOfWork {
  run<T>(
    work: (
      connections: ProviderConnectionRepository,
      credentials: ProviderCredentialStore
    ) => Promise<T>
  ): Promise<T>;
}

export interface ProviderCredentialResolver {
  resolve(providerConnectionId: string, credentialType: ProviderCredentialType): Promise<string>;
}
