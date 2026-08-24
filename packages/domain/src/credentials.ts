import type { ProviderType } from "./dashboard";

export type CredentialStatus =
  "not_configured" | "pending_validation" | "valid" | "expired" | "invalid" | "revoked";

export type ProviderCredentialType = "music_u";

export interface ProtectedSecret {
  readonly authTag: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly encryptionVersion: number;
  readonly keyId: string;
  readonly nonce: Uint8Array;
}

export interface ProviderCredentialRecord extends ProtectedSecret {
  readonly createdAt: Date;
  readonly credentialType: ProviderCredentialType;
  readonly providerConnectionId: string;
  readonly status: CredentialStatus;
  readonly updatedAt: Date;
}

export interface ProviderConnectionView {
  readonly configured: boolean;
  readonly credentialStatus: CredentialStatus;
  readonly credentialUpdatedAt: Date | null;
  readonly displayName: string | null;
  readonly enabled: boolean;
  readonly lastValidatedAt: Date | null;
  readonly provider: Extract<ProviderType, "netease">;
  readonly providerAccountId: string | null;
}
