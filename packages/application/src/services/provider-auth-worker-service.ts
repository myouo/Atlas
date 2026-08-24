import {
  PermanentProviderError,
  ProviderAuthenticationError,
  ProviderAuthAttemptStateError,
  ProviderSchemaMismatchError,
  RetryableProviderError
} from "@nivalis/domain";
import type { OwnerContext, ProviderAuthAttemptRecord } from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { SecretProtector } from "../ports/credentials";
import type {
  ProviderAuthAttemptRepository,
  ProviderAuthJobQueue,
  ProviderAuthRuntimeRegistry,
  ProviderAuthWorkerResult
} from "../ports/provider-auth";

export interface ProviderAuthWorkerOptions {
  readonly leaseMs: number;
  readonly maxFailures: number;
  readonly qrPollIntervalMs: number;
  readonly smsResendDelayMs: number;
}

export class ProviderAuthWorkerService {
  constructor(
    private readonly repository: ProviderAuthAttemptRepository,
    private readonly queue: ProviderAuthJobQueue,
    private readonly runtimes: ProviderAuthRuntimeRegistry,
    private readonly secrets: SecretProtector,
    private readonly clock: Clock,
    private readonly connectCredential: (
      context: OwnerContext,
      credential: string,
      attemptCreatedAt: Date
    ) => Promise<unknown>,
    private readonly options: ProviderAuthWorkerOptions
  ) {}

  async process(attemptId: string): Promise<ProviderAuthWorkerResult> {
    const existing = await this.repository.get(attemptId);
    if (!existing) throw new ProviderAuthAttemptStateError("Provider AuthAttempt does not exist.");
    if (isTerminal(existing)) return { attempt: existing, recheckAfterMs: null };
    const now = this.clock.now();
    if (existing.expiresAt <= now) {
      return { attempt: await this.repository.markExpired(existing.id, now), recheckAfterMs: null };
    }
    const claimed = await this.repository.claim(
      existing.id,
      now,
      new Date(now.getTime() + this.options.leaseMs)
    );
    if (!claimed) return { attempt: existing, recheckAfterMs: null };
    const runtime = this.runtimes.get(claimed.provider);
    if (!runtime) {
      return {
        attempt: await this.repository.markFailed(
          claimed.id,
          "provider-auth-runtime-unavailable",
          "The Provider authentication runtime is unavailable.",
          this.clock.now()
        ),
        recheckAfterMs: null
      };
    }

    try {
      switch (claimed.operation) {
        case "qr_prepare": {
          const prepared = await runtime.beginQr();
          const protectedState = await this.protectState(claimed, prepared.privateState);
          const attempt = await this.repository.markQrPrepared({
            attemptId: claimed.id,
            now: this.clock.now(),
            protectedState
          });
          await this.queue.enqueue(claimed.id, this.options.qrPollIntervalMs / 1_000);
          return { attempt, recheckAfterMs: this.options.qrPollIntervalMs };
        }
        case "qr_poll": {
          const state = await this.unprotectState(claimed);
          const result = await runtime.pollQr(state);
          if (result.status === "expired") {
            return {
              attempt: await this.repository.markExpired(claimed.id, this.clock.now()),
              recheckAfterMs: null
            };
          }
          if (result.status === "connected") {
            const reserved = await this.repository.beginCompletion(claimed.id, this.clock.now());
            if (!reserved) {
              const latest = await this.repository.get(claimed.id);
              if (!latest) throw new ProviderAuthAttemptStateError();
              if (latest.expiresAt <= this.clock.now() && !isTerminal(latest)) {
                return {
                  attempt: await this.repository.markExpired(latest.id, this.clock.now()),
                  recheckAfterMs: null
                };
              }
              return { attempt: latest, recheckAfterMs: null };
            }
            await this.connectCredential(
              { actorId: claimed.ownerId },
              result.credential,
              claimed.createdAt
            );
            return {
              attempt: await this.repository.markConnected(claimed.id, this.clock.now()),
              recheckAfterMs: null
            };
          }
          const attempt = await this.repository.markQrWaiting(
            claimed.id,
            result.status,
            this.clock.now()
          );
          await this.queue.enqueue(claimed.id, this.options.qrPollIntervalMs / 1_000);
          return { attempt, recheckAfterMs: this.options.qrPollIntervalMs };
        }
        case "sms_send": {
          await runtime.sendSms(await this.unprotectState(claimed));
          return {
            attempt: await this.repository.markSmsCodeSent(
              claimed.id,
              new Date(this.clock.now().getTime() + this.options.smsResendDelayMs),
              this.clock.now()
            ),
            recheckAfterMs: null
          };
        }
        case "sms_verify": {
          const result = await runtime.verifySms(await this.unprotectState(claimed));
          const reserved = await this.repository.beginCompletion(claimed.id, this.clock.now());
          if (!reserved) {
            const latest = await this.repository.get(claimed.id);
            if (!latest) throw new ProviderAuthAttemptStateError();
            if (latest.expiresAt <= this.clock.now() && !isTerminal(latest)) {
              return {
                attempt: await this.repository.markExpired(latest.id, this.clock.now()),
                recheckAfterMs: null
              };
            }
            return { attempt: latest, recheckAfterMs: null };
          }
          await this.connectCredential(
            { actorId: claimed.ownerId },
            result.credential,
            claimed.createdAt
          );
          return {
            attempt: await this.repository.markConnected(claimed.id, this.clock.now()),
            recheckAfterMs: null
          };
        }
      }
    } catch (error) {
      if (error instanceof RetryableProviderError) {
        const retry = await this.repository.markRetry(
          claimed.id,
          retryErrorCode(error),
          "The Provider authentication request failed temporarily.",
          this.clock.now()
        );
        if (retry.failureCount < this.options.maxFailures) throw error;
        return {
          attempt: await this.repository.markFailed(
            claimed.id,
            error.code,
            "The Provider authentication request exhausted its retry limit.",
            this.clock.now()
          ),
          recheckAfterMs: null
        };
      }
      const mapped = safeAuthError(error);
      return {
        attempt: await this.repository.markFailed(
          claimed.id,
          mapped.code,
          mapped.message,
          this.clock.now()
        ),
        recheckAfterMs: null
      };
    }
  }

  private protectState(attempt: ProviderAuthAttemptRecord, state: string) {
    return this.secrets.protect(state, {
      credentialType: "netease_auth_state",
      ownerId: attempt.ownerId,
      purpose: "provider_auth_attempt",
      subjectId: attempt.id
    });
  }

  private unprotectState(attempt: ProviderAuthAttemptRecord) {
    if (!attempt.protectedState) throw new ProviderAuthAttemptStateError();
    return this.secrets.unprotect(attempt.protectedState, {
      credentialType: "netease_auth_state",
      ownerId: attempt.ownerId,
      purpose: "provider_auth_attempt",
      subjectId: attempt.id
    });
  }
}

function retryErrorCode(error: RetryableProviderError) {
  const diagnostic = error.diagnosticCode?.replaceAll(/[^a-z0-9-]/gi, "").slice(0, 60);
  return diagnostic ? `${error.code}.${diagnostic}` : error.code;
}

function safeAuthError(error: unknown) {
  if (error instanceof ProviderAuthenticationError) {
    return { code: error.code, message: "The Provider rejected the authentication attempt." };
  }
  if (error instanceof PermanentProviderError) {
    return { code: error.code, message: "The Provider authentication request was rejected." };
  }
  if (error instanceof ProviderSchemaMismatchError) {
    return {
      code: error.code,
      message: "The Provider authentication response schema changed."
    };
  }
  return {
    code: "provider-authentication-failed",
    message: "The Provider could not complete authentication."
  };
}

function isTerminal(attempt: ProviderAuthAttemptRecord) {
  return ["connected", "expired", "failed"].includes(attempt.status);
}
