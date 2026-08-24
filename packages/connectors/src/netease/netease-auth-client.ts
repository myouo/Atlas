import { ProviderAuthenticationError, ProviderSchemaMismatchError } from "@nivalis/domain";
import type { ProviderAuthRuntimeModule, ProviderQrPollResult } from "@nivalis/domain";
import Value from "typebox/value";

import { NeteaseClient, type NeteaseClientOptions } from "./netease-client";
import {
  NeteaseAuthResponseSchema,
  NeteaseQrCheckResponseSchema,
  NeteaseQrKeyResponseSchema
} from "./schemas/provider-schemas";

const QR_CODES = new Set([800, 801, 802, 803]);
const AUTH_CODES = new Set([200, 400, 415, 460, 501, 502, 509]);

export class NeteaseAuthClient extends NeteaseClient implements ProviderAuthRuntimeModule {
  readonly provider = "netease" as const;

  constructor(options: NeteaseClientOptions, fetcher: typeof fetch = fetch) {
    super(options, fetcher);
  }

  async beginQr() {
    const response = await this.eapiResponse(
      "/api/login/qrcode/unikey",
      { type: 3 },
      "",
      new Set([200])
    );
    if (!Value.Check(NeteaseQrKeyResponseSchema, response.payload)) {
      throw new ProviderSchemaMismatchError("netease.auth.qr_key");
    }
    const key = response.payload.unikey ?? response.payload.data?.unikey;
    if (!key) throw new ProviderSchemaMismatchError("netease.auth.qr_key");
    const qrUrl = `https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
    return {
      privateState: JSON.stringify({ key, qrUrl }),
      qrUrl
    };
  }

  async pollQr(privateState: string): Promise<ProviderQrPollResult> {
    const { key } = parseQrState(privateState);
    const response = await this.eapiResponse(
      "/api/login/qrcode/client/login",
      { key, type: 3 },
      "",
      QR_CODES
    );
    if (!Value.Check(NeteaseQrCheckResponseSchema, response.payload)) {
      throw new ProviderSchemaMismatchError("netease.auth.qr_check");
    }
    switch (response.payload.code) {
      case 800:
        return { status: "expired" };
      case 801:
        return { status: "waiting_for_scan" };
      case 802:
        return { status: "waiting_for_confirmation" };
      case 803:
        return {
          credential: requiredMusicU(response.cookies),
          status: "connected"
        };
    }
  }

  async sendSms(privateState: string) {
    const state = parseSmsState(privateState, false);
    const response = await this.weapiResponse(
      "/api/sms/captcha/sent",
      {
        cellphone: state.phone,
        ctcode: state.countryCode,
        secrete: "music_middleuser_pclogin"
      },
      "",
      AUTH_CODES
    );
    const code = authCode(response.payload, "netease.auth.sms_send");
    if (code !== 200) throw authRejected(code, false);
  }

  async verifySms(privateState: string) {
    const state = parseSmsState(privateState, true);
    const response = await this.weapiResponse(
      "/api/w/login/cellphone",
      {
        captcha: state.code,
        countrycode: state.countryCode,
        https: "true",
        password: state.code,
        phone: state.phone,
        remember: "true",
        secureCaptcha: "",
        type: "1"
      },
      "",
      AUTH_CODES
    );
    const code = authCode(response.payload, "netease.auth.sms_verify");
    if (code !== 200) throw authRejected(code, true);
    return { credential: requiredMusicU(response.cookies) };
  }
}

function parseQrState(value: string) {
  const state = parseJson(value);
  if (typeof state.key !== "string" || !state.key) {
    throw new ProviderAuthenticationError("provider_rejected");
  }
  return { key: state.key };
}

function parseSmsState(value: string, requireCode: boolean) {
  const state = parseJson(value);
  if (
    typeof state.phone !== "string" ||
    !/^\d{5,20}$/.test(state.phone) ||
    typeof state.countryCode !== "string" ||
    !/^\d{1,4}$/.test(state.countryCode) ||
    (requireCode && (typeof state.code !== "string" || !/^\d{4,8}$/.test(state.code)))
  ) {
    throw new ProviderAuthenticationError("provider_rejected");
  }
  return {
    code: typeof state.code === "string" ? state.code : "",
    countryCode: state.countryCode,
    phone: state.phone
  };
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The caller receives one generic Provider authentication error.
  }
  throw new ProviderAuthenticationError("provider_rejected");
}

function authCode(payload: unknown, sourceKind: string) {
  if (!Value.Check(NeteaseAuthResponseSchema, payload)) {
    throw new ProviderSchemaMismatchError(sourceKind);
  }
  return payload.code;
}

function authRejected(code: number, verification: boolean) {
  if (code === 460 || code === 509) return new ProviderAuthenticationError("risk_control");
  if (verification && (code === 400 || code === 415 || code === 502)) {
    return new ProviderAuthenticationError("invalid_code");
  }
  return new ProviderAuthenticationError("provider_rejected");
}

function requiredMusicU(cookies: readonly string[]) {
  for (const cookie of cookies) {
    const firstSegment = cookie.split(";", 1)[0] ?? "";
    const separator = firstSegment.indexOf("=");
    if (separator < 0 || firstSegment.slice(0, separator).trim() !== "MUSIC_U") continue;
    const value = firstSegment.slice(separator + 1).trim();
    if (value.length >= 16) return value;
  }
  throw new ProviderAuthenticationError("credential_missing");
}
