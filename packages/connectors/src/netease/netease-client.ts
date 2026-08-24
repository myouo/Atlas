import { constants, createCipheriv, createHash, publicEncrypt, randomBytes } from "node:crypto";

import {
  PermanentProviderError,
  ProviderCredentialError,
  RetryableProviderError
} from "@nivalis/domain";
import type { JsonObject, JsonValue } from "@nivalis/domain";

import { NETEASE_CREDENTIAL_CODES, NETEASE_RETRYABLE_CODES } from "./errors";

const MUSIC_ORIGIN = "https://music.163.com";
const INTERFACE_PC_ORIGIN = "https://interfacepc.music.163.com";
const WEAPI_IV = Buffer.from("0102030405060708");
const WEAPI_PRESET_KEY = Buffer.from("0CoJUm6Qyw8W8jud");
const EAPI_KEY = Buffer.from("e82ckenh8dichen8");
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const WEAPI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;

export interface NeteaseClientOptions {
  readonly timeoutMs: number;
}

export interface NeteaseTransportResponse {
  readonly cookies: readonly string[];
  readonly payload: JsonValue;
}

export class NeteaseClient {
  constructor(
    private readonly options: NeteaseClientOptions,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  getAccount(credential: string) {
    return this.weapi("/api/w/nuser/account/get", {}, credential);
  }

  getUserLevel(credential: string) {
    return this.weapi("/api/user/level", {}, credential);
  }

  getWeeklyRecord(credential: string, userId: string) {
    return this.weapi(
      "/api/v1/play/record",
      { limit: 100, offset: 0, total: true, type: 1, uid: userId },
      credential
    );
  }

  getRecentSongs(credential: string) {
    return this.weapi("/api/play-record/song/list", { limit: 100 }, credential);
  }

  getWeeklyListenReport(credential: string) {
    return this.eapi(
      "/api/content/activity/listen/data/realtime/report",
      { type: "week" },
      credential
    );
  }

  protected async weapiResponse(
    path: string,
    data: JsonObject,
    credential = "",
    acceptedProviderCodes: ReadonlySet<number> = new Set([200])
  ) {
    const encrypted = encryptWeapi({ ...data, csrf_token: "" });
    return this.request(
      new URL(path.replace("/api/", "/weapi/"), MUSIC_ORIGIN),
      encrypted,
      credential,
      { referer: MUSIC_ORIGIN },
      acceptedProviderCodes
    );
  }

  protected async eapiResponse(
    path: string,
    data: JsonObject,
    credential = "",
    acceptedProviderCodes: ReadonlySet<number> = new Set([200])
  ) {
    const header = {
      __csrf: "",
      appver: "3.1.17.204416",
      buildver: String(Math.floor(Date.now() / 1_000)),
      channel: "netease",
      os: "pc",
      osver: "Microsoft-Windows-10-Professional-build-19045-64bit",
      ...(credential ? { MUSIC_U: credential } : {})
    };
    const encrypted = encryptEapi(path, { ...data, header });
    return this.request(
      new URL(path.replace("/api/", "/eapi/"), INTERFACE_PC_ORIGIN),
      encrypted,
      credential,
      {},
      acceptedProviderCodes
    );
  }

  private async weapi(path: string, data: JsonObject, credential: string) {
    return (await this.weapiResponse(path, data, credential)).payload;
  }

  private async eapi(path: string, data: JsonObject, credential: string) {
    return (await this.eapiResponse(path, data, credential)).payload;
  }

  private async request(
    url: URL,
    body: Record<string, string>,
    credential: string,
    extraHeaders: Record<string, string> = {},
    acceptedProviderCodes: ReadonlySet<number> = new Set([200])
  ): Promise<NeteaseTransportResponse> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        body: new URLSearchParams(body),
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          cookie: credentialCookie(credential),
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          ...extraHeaders
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(this.options.timeoutMs)
      });
    } catch {
      throw new RetryableProviderError("NetEase request timed out or was unavailable.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderCredentialError("expired");
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableProviderError("NetEase request failed temporarily.");
    }
    if (!response.ok) throw new PermanentProviderError("NetEase request was rejected.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PermanentProviderError("NetEase response was not JSON.");
    }
    if (!isJsonValue(payload)) throw new PermanentProviderError("NetEase response was invalid.");
    if (isObject(payload) && typeof payload.code === "number") {
      if (NETEASE_CREDENTIAL_CODES.has(payload.code)) throw new ProviderCredentialError("expired");
      if (NETEASE_RETRYABLE_CODES.has(payload.code)) {
        throw new RetryableProviderError("NetEase response requested retry.");
      }
      if (!acceptedProviderCodes.has(payload.code)) {
        throw new PermanentProviderError("NetEase response was rejected.");
      }
    }
    return { cookies: responseCookies(response.headers), payload };
  }
}

function encryptWeapi(value: JsonObject) {
  const secret = randomSecret();
  const first = aesCbc(JSON.stringify(value), WEAPI_PRESET_KEY);
  const params = aesCbc(first, Buffer.from(secret));
  const reversed = Buffer.from([...secret].reverse().join(""));
  const padded = Buffer.alloc(128);
  reversed.copy(padded, padded.length - reversed.length);
  const encSecKey = publicEncrypt(
    { key: WEAPI_PUBLIC_KEY, padding: constants.RSA_NO_PADDING },
    padded
  ).toString("hex");
  return { encSecKey, params };
}

function encryptEapi(path: string, value: JsonObject) {
  const text = JSON.stringify(value);
  const digest = createHash("md5").update(`nobody${path}use${text}md5forencrypt`).digest("hex");
  const message = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = createCipheriv("aes-128-ecb", EAPI_KEY, null);
  return {
    params: Buffer.concat([cipher.update(message, "utf8"), cipher.final()])
      .toString("hex")
      .toUpperCase()
  };
}

function aesCbc(value: string, key: Buffer) {
  const cipher = createCipheriv("aes-128-cbc", key, WEAPI_IV);
  return Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64");
}

function randomSecret() {
  const bytes = randomBytes(16);
  return Array.from(bytes, (byte) => BASE62[byte % BASE62.length]).join("");
}

function credentialCookie(credential: string) {
  return [
    ...(credential ? [`MUSIC_U=${credential}`] : []),
    "os=pc",
    "appver=3.1.17.204416",
    "__remember_me=true"
  ].join("; ");
}

function responseCookies(headers: Headers): readonly string[] {
  const withSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withSetCookie.getSetCookie === "function") return withSetCookie.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && value !== null && Object.values(value).every(isJsonValue);
}
