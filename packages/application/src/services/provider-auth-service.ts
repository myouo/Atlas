import {
  ProviderNotConfiguredError,
  ProviderAuthAttemptNotFoundError,
  ProviderAuthAttemptStateError
} from "@nivalis/domain";
import type { OwnerContext, ProviderAuthAttemptRecord } from "@nivalis/domain";

import type { Clock } from "../ports/dashboard-repository";
import type { SecretProtector } from "../ports/credentials";
import type {
  ProviderAuthAttemptRepository,
  ProviderAuthEnqueueUnitOfWork,
  ProviderAuthIdentityFactory
} from "../ports/provider-auth";

export interface ProviderAuthServiceOptions {
  readonly providerEnabled: boolean;
  readonly qrTtlMs: number;
  readonly smsTtlMs: number;
}

export class ProviderAuthService {
  constructor(
    private readonly repository: ProviderAuthAttemptRepository,
    private readonly enqueueUnitOfWork: ProviderAuthEnqueueUnitOfWork,
    private readonly secrets: SecretProtector,
    private readonly identities: ProviderAuthIdentityFactory,
    private readonly clock: Clock,
    private readonly options: ProviderAuthServiceOptions
  ) {}

  async startQr(context: OwnerContext) {
    if (!this.options.providerEnabled) throw new ProviderNotConfiguredError("netease");
    const now = this.clock.now();
    const attempt = await this.enqueueUnitOfWork.run(async (repository, queue) => {
      const result = await repository.createOrGetActive({
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.options.qrTtlMs),
        id: this.identities.create(),
        maskedPhone: null,
        method: "qr",
        operation: "qr_prepare",
        ownerId: context.actorId,
        protectedState: null
      });
      if (result.created) await queue.enqueue(result.attempt.id);
      return result.attempt;
    });
    return this.withPublicState(attempt);
  }

  async startSms(context: OwnerContext, phone: string, countryCode: string) {
    if (!this.options.providerEnabled) throw new ProviderNotConfiguredError("netease");
    if (!/^\d{5,20}$/.test(phone) || !/^\d{1,4}$/.test(countryCode)) {
      throw new ProviderAuthAttemptStateError("The SMS login input is invalid.");
    }
    const now = this.clock.now();
    const id = this.identities.create();
    const protectedState = await this.protectState(
      id,
      context.actorId,
      JSON.stringify({ countryCode, phone })
    );
    const attempt = await this.enqueueUnitOfWork.run(async (repository, queue) => {
      const result = await repository.createOrGetActive({
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.options.smsTtlMs),
        id,
        maskedPhone: maskPhone(phone, countryCode),
        method: "sms_otp",
        operation: "sms_send",
        ownerId: context.actorId,
        protectedState
      });
      if (result.created) await queue.enqueue(result.attempt.id);
      return result.attempt;
    });
    return this.withPublicState(attempt);
  }

  async get(context: OwnerContext, attemptId: string) {
    const attempt = await this.repository.getForOwner(context.actorId, attemptId);
    if (!attempt) throw new ProviderAuthAttemptNotFoundError(attemptId);
    if (isActive(attempt) && attempt.expiresAt <= this.clock.now()) {
      return this.repository.markExpired(attempt.id, this.clock.now());
    }
    return this.withPublicState(attempt);
  }

  async assertNoActive(context: OwnerContext) {
    if (await this.repository.findActiveForOwner(context.actorId)) {
      throw new ProviderAuthAttemptStateError(
        "Cancel or finish the active Provider authentication attempt first."
      );
    }
  }

  async cancel(context: OwnerContext, attemptId: string) {
    const cancelled = await this.repository.cancelForOwner(
      context.actorId,
      attemptId,
      this.clock.now()
    );
    if (cancelled) return cancelled;
    const existing = await this.repository.getForOwner(context.actorId, attemptId);
    if (!existing) throw new ProviderAuthAttemptNotFoundError(attemptId);
    throw new ProviderAuthAttemptStateError(
      "The Provider authentication attempt can no longer be cancelled."
    );
  }

  cancelAll(context: OwnerContext) {
    return this.repository.cancelActiveForOwner(context.actorId, this.clock.now());
  }

  async verifySms(context: OwnerContext, attemptId: string, code: string) {
    if (!/^\d{4,8}$/.test(code)) {
      throw new ProviderAuthAttemptStateError("The SMS verification code is invalid.");
    }
    const attempt = await this.repository.getForOwner(context.actorId, attemptId);
    if (!attempt) throw new ProviderAuthAttemptNotFoundError(attemptId);
    if (
      attempt.method !== "sms_otp" ||
      attempt.status !== "waiting_for_code" ||
      !attempt.protectedState ||
      attempt.expiresAt <= this.clock.now()
    ) {
      throw new ProviderAuthAttemptStateError();
    }
    const current = await this.unprotectState(attempt);
    const parsed = parseSmsState(current);
    const protectedState = await this.protectState(
      attempt.id,
      attempt.ownerId,
      JSON.stringify({ ...parsed, code })
    );
    return this.enqueueUnitOfWork.run(async (repository, queue) => {
      const queued = await repository.queueSmsVerification(
        context.actorId,
        attempt.id,
        protectedState,
        this.clock.now()
      );
      if (!queued) throw new ProviderAuthAttemptStateError();
      await queue.enqueue(attempt.id);
      return queued;
    });
  }

  private protectState(attemptId: string, ownerId: string, state: string) {
    return this.secrets.protect(state, {
      credentialType: "netease_auth_state",
      ownerId,
      purpose: "provider_auth_attempt",
      subjectId: attemptId
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

  private async withPublicState(attempt: ProviderAuthAttemptRecord) {
    if (attempt.method !== "qr" || !attempt.protectedState || isTerminal(attempt)) return attempt;
    const state = parseQrPublicState(await this.unprotectState(attempt));
    return { ...attempt, qrUrl: state.qrUrl };
  }
}

function maskPhone(phone: string, countryCode: string) {
  const visibleStart = phone.slice(0, Math.min(3, Math.max(1, phone.length - 4)));
  const visibleEnd = phone.slice(-Math.min(4, phone.length));
  return `+${countryCode} ${visibleStart}${"*".repeat(Math.max(3, phone.length - visibleStart.length - visibleEnd.length))}${visibleEnd}`;
}

function parseSmsState(value: string): { readonly countryCode: string; readonly phone: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new ProviderAuthAttemptStateError();
  }
  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof (candidate as { phone?: unknown }).phone !== "string" ||
    typeof (candidate as { countryCode?: unknown }).countryCode !== "string"
  ) {
    throw new ProviderAuthAttemptStateError();
  }
  return candidate as { readonly countryCode: string; readonly phone: string };
}

function isActive(attempt: ProviderAuthAttemptRecord) {
  return !["connected", "expired", "failed"].includes(attempt.status);
}

function isTerminal(attempt: ProviderAuthAttemptRecord) {
  return ["connected", "expired", "failed"].includes(attempt.status);
}

function parseQrPublicState(value: string) {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new ProviderAuthAttemptStateError();
  }
  const qrUrl = (candidate as { qrUrl?: unknown } | null)?.qrUrl;
  if (typeof qrUrl !== "string") throw new ProviderAuthAttemptStateError();
  try {
    const url = new URL(qrUrl);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw new ProviderAuthAttemptStateError();
  }
  return { qrUrl };
}
