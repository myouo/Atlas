import type { AuthService } from "@nivalis/application";
import { ForbiddenError, UnauthenticatedError } from "@nivalis/domain";
import type { OwnerContext } from "@nivalis/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";

export const SESSION_COOKIE_NAME = "nivalis_session";

declare module "fastify" {
  interface FastifyRequest {
    nivalisOwner?: OwnerContext;
  }
}

export function registerAuthorizationBoundary(
  app: FastifyInstance,
  auth: AuthService,
  allowedOrigins: readonly string[]
) {
  const origins = new Set(allowedOrigins);
  app.addHook("preHandler", async (request) => {
    const ownerRoute = request.url.startsWith("/v1/me/");
    const logoutRoute = request.url.startsWith("/v1/auth/logout");
    if (!ownerRoute && !logoutRoute) return;
    if (isUnsafe(request.method)) assertAllowedOrigin(request, origins);
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (logoutRoute) {
      if (!(await auth.getSession(token))) throw new UnauthenticatedError();
      return;
    }
    request.nivalisOwner = await auth.requireOwner(token);
  });
}

export function requireOwnerContext(request: FastifyRequest): OwnerContext {
  if (!request.nivalisOwner) throw new ForbiddenError();
  return request.nivalisOwner;
}

export function readSessionToken(request: FastifyRequest) {
  return readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean) {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    `Expires=${expiresAt.toUTCString()}`
  ].join("; ");
}

export function expiredSessionCookie(secure: boolean) {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ].join("; ");
}

function assertAllowedOrigin(request: FastifyRequest, allowed: ReadonlySet<string>) {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !allowed.has(origin)) throw new ForbiddenError();
}

function isUnsafe(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() !== name) continue;
    const value = segment.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}
