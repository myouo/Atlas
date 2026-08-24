import type { AuthService } from "@nivalis/application";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import {
  AuthCallbackQuerySchema,
  AuthSessionSchema,
  AuthStartSchema,
  ProblemDetailsSchema,
  RedirectResponseSchema
} from "./schemas";
import { expiredSessionCookie, readSessionToken, sessionCookie } from "./auth-boundary";

interface AuthRouteOptions {
  readonly appPublicOrigin: string;
  readonly auth: AuthService;
  readonly secureCookies: boolean;
}

export const authRoutes: FastifyPluginAsyncTypebox<AuthRouteOptions> = async (app, options) => {
  app.post(
    "/v1/auth/github/start",
    {
      schema: {
        response: {
          200: AuthStartSchema,
          400: ProblemDetailsSchema,
          503: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (_request, reply) => {
      const started = await options.auth.startGithubAuthentication();
      return reply.header("cache-control", "no-store").send({
        authorizationUrl: started.authorizationUrl,
        expiresAt: started.expiresAt.toISOString()
      });
    }
  );

  app.get(
    "/v1/auth/github/callback",
    {
      schema: {
        querystring: AuthCallbackQuerySchema,
        response: {
          302: RedirectResponseSchema,
          400: ProblemDetailsSchema,
          502: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const session = await options.auth.completeGithubAuthentication(
        request.query.code,
        request.query.state
      );
      return reply
        .header("cache-control", "no-store")
        .header("referrer-policy", "no-referrer")
        .header(
          "set-cookie",
          sessionCookie(session.token, session.expiresAt, options.secureCookies)
        )
        .redirect(`${options.appPublicOrigin}/settings?auth=success`);
    }
  );

  app.get(
    "/v1/auth/session",
    {
      schema: {
        response: {
          200: AuthSessionSchema,
          400: ProblemDetailsSchema,
          default: ProblemDetailsSchema
        }
      }
    },
    async (request, reply) => {
      const session = await options.auth.getSession(readSessionToken(request));
      return reply.header("cache-control", "no-store").send(
        session
          ? {
              actorId: session.actor.id,
              authenticated: true,
              expiresAt: session.expiresAt.toISOString(),
              role: session.actor.role
            }
          : { actorId: null, authenticated: false, expiresAt: null, role: null }
      );
    }
  );

  app.post(
    "/v1/auth/logout",
    {
      schema: {
        response: { 401: ProblemDetailsSchema, default: ProblemDetailsSchema }
      }
    },
    async (request, reply) => {
      await options.auth.logout(readSessionToken(request));
      reply.code(204).header("set-cookie", expiredSessionCookie(options.secureCookies));
    }
  );
};
