import type {
  ProtectedSecret,
  ProviderAuthAttempt,
  ProviderAuthAttemptOperation,
  ProviderAuthAttemptRecord,
  ProviderAuthMethod,
  ProviderAuthRuntimeModule
} from "@nivalis/domain";

export interface CreateProviderAuthAttemptInput {
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly id: string;
  readonly maskedPhone: string | null;
  readonly method: ProviderAuthMethod;
  readonly operation: ProviderAuthAttemptOperation;
  readonly ownerId: string;
  readonly protectedState: ProtectedSecret | null;
}

export interface ProviderAuthAttemptRepository {
  claim(
    attemptId: string,
    now: Date,
    leaseExpiresAt: Date
  ): Promise<ProviderAuthAttemptRecord | null>;
  createOrGetActive(
    input: CreateProviderAuthAttemptInput
  ): Promise<{ readonly attempt: ProviderAuthAttemptRecord; readonly created: boolean }>;
  get(attemptId: string): Promise<ProviderAuthAttemptRecord | null>;
  beginCompletion(attemptId: string, now: Date): Promise<ProviderAuthAttemptRecord | null>;
  cancelForOwner(
    ownerId: string,
    attemptId: string,
    now: Date
  ): Promise<ProviderAuthAttemptRecord | null>;
  cancelActiveForOwner(ownerId: string, now: Date): Promise<number>;
  findActiveForOwner(ownerId: string): Promise<ProviderAuthAttemptRecord | null>;
  getForOwner(ownerId: string, attemptId: string): Promise<ProviderAuthAttemptRecord | null>;
  markConnected(attemptId: string, now: Date): Promise<ProviderAuthAttemptRecord>;
  markExpired(attemptId: string, now: Date): Promise<ProviderAuthAttemptRecord>;
  markFailed(
    attemptId: string,
    errorCode: string,
    errorMessage: string,
    now: Date
  ): Promise<ProviderAuthAttemptRecord>;
  markQrPrepared(input: {
    readonly attemptId: string;
    readonly now: Date;
    readonly protectedState: ProtectedSecret;
  }): Promise<ProviderAuthAttemptRecord>;
  markQrWaiting(
    attemptId: string,
    status: "waiting_for_confirmation" | "waiting_for_scan",
    now: Date
  ): Promise<ProviderAuthAttemptRecord>;
  markRetry(
    attemptId: string,
    errorCode: string,
    errorMessage: string,
    now: Date
  ): Promise<ProviderAuthAttemptRecord>;
  markSmsCodeSent(
    attemptId: string,
    resendAfter: Date,
    now: Date
  ): Promise<ProviderAuthAttemptRecord>;
  queueSmsVerification(
    ownerId: string,
    attemptId: string,
    protectedState: ProtectedSecret,
    now: Date
  ): Promise<ProviderAuthAttemptRecord | null>;
}

export interface ProviderAuthJobQueue {
  enqueue(attemptId: string, delaySeconds?: number): Promise<string>;
}

export interface ProviderAuthEnqueueUnitOfWork {
  run<T>(
    work: (repository: ProviderAuthAttemptRepository, queue: ProviderAuthJobQueue) => Promise<T>
  ): Promise<T>;
}

export interface ProviderAuthRuntimeRegistry {
  get(provider: "netease"): ProviderAuthRuntimeModule | null;
}

export interface ProviderAuthIdentityFactory {
  create(): string;
}

export interface ProviderAuthWorkerResult {
  readonly attempt: ProviderAuthAttempt;
  readonly recheckAfterMs: number | null;
}
