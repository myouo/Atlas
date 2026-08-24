import { AuthService } from "@nivalis/application";
import type { AuthenticatedSession } from "@nivalis/domain";

import { D1AuthRepository } from "./d1-auth-repository";
import { WorkerGitHubOAuthClient } from "./github-oauth-client";
import {
  decodeBase64UrlKey,
  WebCryptoAuthTokenFactory,
  WebCryptoSecretProtector
} from "./web-crypto-auth";

const SESSION_COOKIE = "nivalis_session";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface AuthEnvironment {
  readonly API_PUBLIC_ORIGIN?: string;
  readonly APP_PUBLIC_ORIGIN?: string;
  readonly GITHUB_OAUTH_CLIENT_ID?: string;
  readonly GITHUB_OAUTH_CLIENT_SECRET?: string;
  readonly NIVALIS_CREDENTIAL_KEY_ID?: string;
  readonly NIVALIS_CREDENTIAL_MASTER_KEY?: string;
  readonly NIVALIS_OWNER_ID?: string;
  readonly OWNER_GITHUB_USER_ID?: string;
}

export interface AuthRuntime {
  readonly appOrigin: string;
  readonly service: AuthService;
}

export function createAuthRuntime(
  database: D1Database,
  environment: AuthEnvironment
): AuthRuntime | null {
  const clientId = nonEmpty(environment.GITHUB_OAUTH_CLIENT_ID);
  const clientSecret = nonEmpty(environment.GITHUB_OAUTH_CLIENT_SECRET);
  const apiOrigin = validOrigin(environment.API_PUBLIC_ORIGIN);
  const appOrigin = validOrigin(environment.APP_PUBLIC_ORIGIN);
  const masterKey = nonEmpty(environment.NIVALIS_CREDENTIAL_MASTER_KEY);
  const ownerActorId = nonEmpty(environment.NIVALIS_OWNER_ID);
  const ownerGithubUserId = nonEmpty(environment.OWNER_GITHUB_USER_ID);
  if (
    !clientId ||
    !clientSecret ||
    !apiOrigin ||
    !appOrigin ||
    !masterKey ||
    !ownerActorId ||
    !ownerGithubUserId
  ) {
    return null;
  }

  const tokens = new WebCryptoAuthTokenFactory();
  const repository = new D1AuthRepository(database);
  const service = new AuthService(
    repository,
    new WorkerGitHubOAuthClient({
      clientId,
      clientSecret,
      redirectUri: new URL("/v1/auth/github/callback", apiOrigin).toString()
    }),
    tokens,
    new WebCryptoSecretProtector(
      decodeBase64UrlKey(masterKey),
      nonEmpty(environment.NIVALIS_CREDENTIAL_KEY_ID) ?? "primary"
    ),
    { now: () => new Date() },
    {
      oauthStateTtlMs: OAUTH_STATE_TTL_MS,
      ownerActorId,
      ownerGithubUserId,
      sessionTtlMs: SESSION_TTL_MS
    }
  );
  return { appOrigin, service };
}

export async function readAuthSession(
  request: Request,
  database: D1Database
): Promise<AuthenticatedSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokens = new WebCryptoAuthTokenFactory();
  return new D1AuthRepository(database).findSessionByTokenHash(
    await tokens.hashOpaqueToken(token),
    new Date()
  );
}

export async function revokeAuthSession(request: Request, database: D1Database) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return false;
  const tokens = new WebCryptoAuthTokenFactory();
  await new D1AuthRepository(database).revokeSession(
    await tokens.hashOpaqueToken(token),
    new Date()
  );
  return true;
}

export function sessionCookie(token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function nonEmpty(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validOrigin(value: string | undefined) {
  const normalized = nonEmpty(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.hostname === "127.0.0.1" ? url.origin : null;
  } catch {
    return null;
  }
}
