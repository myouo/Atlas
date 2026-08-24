import type { ProtectedSecret } from "./credentials";
import type { ProviderType } from "./dashboard";

export type ProviderAuthMethod = "qr" | "sms_otp";

export type ProviderAuthAttemptStatus =
  | "queued"
  | "preparing"
  | "waiting_for_scan"
  | "waiting_for_confirmation"
  | "waiting_for_code"
  | "verifying"
  | "connected"
  | "expired"
  | "failed";

export type ProviderAuthAttemptOperation = "qr_prepare" | "qr_poll" | "sms_send" | "sms_verify";

export interface ProviderAuthAttempt {
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly finishedAt: Date | null;
  readonly id: string;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly maskedPhone: string | null;
  readonly method: ProviderAuthMethod;
  readonly provider: Extract<ProviderType, "netease">;
  readonly qrUrl: string | null;
  readonly resendAfter: Date | null;
  readonly status: ProviderAuthAttemptStatus;
  readonly updatedAt: Date;
}

export interface ProviderAuthAttemptRecord extends ProviderAuthAttempt {
  readonly failureCount: number;
  readonly leaseExpiresAt: Date | null;
  readonly operation: ProviderAuthAttemptOperation;
  readonly ownerId: string;
  readonly protectedState: ProtectedSecret | null;
}

export type ProviderQrPollResult =
  | { readonly status: "waiting_for_scan" | "waiting_for_confirmation" }
  | { readonly status: "expired" }
  | { readonly credential: string; readonly status: "connected" };

export interface ProviderAuthRuntimeModule {
  readonly provider: Extract<ProviderType, "netease">;
  beginQr(): Promise<{ readonly privateState: string; readonly qrUrl: string }>;
  pollQr(privateState: string): Promise<ProviderQrPollResult>;
  sendSms(privateState: string): Promise<void>;
  verifySms(privateState: string): Promise<{ readonly credential: string }>;
}
