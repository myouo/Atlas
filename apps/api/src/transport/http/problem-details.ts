import {
  DashboardNotFoundError,
  DashboardRevisionNotFoundError,
  ExternalAuthenticationError,
  ForbiddenError,
  InvalidAuthTransactionError,
  InvalidDashboardError,
  InvalidProviderCredentialError,
  ProviderConnectionNotFoundError,
  ProviderAuthAttemptNotFoundError,
  ProviderAuthAttemptStateError,
  ProviderNotConfiguredError,
  RevisionConflictError,
  SyncRunNotFoundError,
  UnauthenticatedError,
  WidgetAlreadyExistsError,
  WidgetNotFoundError
} from "@nivalis/domain";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  formatRevisionEtag,
  InvalidRevisionEtagHttpError,
  PreconditionRequiredHttpError
} from "./revision-etag";

export interface ProblemDetails {
  readonly detail?: string;
  readonly errors?: readonly string[];
  readonly currentEtag?: string;
  readonly currentRevisionId?: string;
  readonly currentRevisionNumber?: number;
  readonly instance?: string;
  readonly requestId: string;
  readonly status: number;
  readonly title: string;
  readonly type: string;
}

export function sendProblem(
  reply: FastifyReply,
  request: FastifyRequest,
  problem: Omit<ProblemDetails, "requestId">
) {
  reply.code(problem.status).type("application/problem+json");
  return { ...problem, requestId: request.id };
}

export function registerProblemHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    reply.send(
      sendProblem(reply, request, {
        detail: "The requested Nivalis resource does not exist.",
        instance: request.url,
        status: 404,
        title: "Resource not found",
        type: "urn:nivalis:problem:resource-not-found"
      })
    )
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.send(
        sendProblem(reply, request, {
          detail: "The request did not match the required schema.",
          instance: request.url,
          status: 400,
          title: "Invalid request",
          type: "urn:nivalis:problem:invalid-request"
        })
      );
    }
    if (
      error instanceof DashboardNotFoundError ||
      error instanceof DashboardRevisionNotFoundError ||
      error instanceof ProviderConnectionNotFoundError ||
      error instanceof ProviderAuthAttemptNotFoundError ||
      error instanceof SyncRunNotFoundError ||
      error instanceof WidgetNotFoundError
    ) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 404,
          title:
            error instanceof DashboardNotFoundError
              ? "Dashboard not found"
              : error instanceof DashboardRevisionNotFoundError
                ? "Dashboard revision not found"
                : error instanceof ProviderConnectionNotFoundError
                  ? "Provider connection not found"
                  : error instanceof ProviderAuthAttemptNotFoundError
                    ? "Provider authentication attempt not found"
                    : error instanceof SyncRunNotFoundError
                      ? "Sync job not found"
                      : "Widget not found",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof UnauthenticatedError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 401,
          title: "Authentication required",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof ForbiddenError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 403,
          title: "Owner authorization required",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof InvalidAuthTransactionError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 400,
          title: "Invalid authentication transaction",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof ExternalAuthenticationError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 502,
          title: "External authentication failed",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof InvalidProviderCredentialError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 400,
          title: "Invalid Provider credential",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof ProviderNotConfiguredError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 409,
          title: "Provider not configured",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof ProviderAuthAttemptStateError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 409,
          title: "Provider authentication state conflict",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof WidgetAlreadyExistsError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 409,
          title: "Widget already exists",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof InvalidDashboardError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          errors: error.issues,
          instance: request.url,
          status: 422,
          title: "Invalid Dashboard",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (error instanceof PreconditionRequiredHttpError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 428,
          title: "Precondition required",
          type: "urn:nivalis:problem:precondition-required"
        })
      );
    }
    if (error instanceof InvalidRevisionEtagHttpError) {
      return reply.send(
        sendProblem(reply, request, {
          detail: error.message,
          instance: request.url,
          status: 400,
          title: "Invalid revision precondition",
          type: "urn:nivalis:problem:invalid-revision-etag"
        })
      );
    }
    if (error instanceof RevisionConflictError) {
      return reply.send(
        sendProblem(reply, request, {
          currentEtag: formatRevisionEtag(error.currentRevisionId),
          currentRevisionId: error.currentRevisionId,
          currentRevisionNumber: error.currentRevisionNumber,
          detail: error.message,
          instance: request.url,
          status: 412,
          title: "Dashboard revision conflict",
          type: `urn:nivalis:problem:${error.code}`
        })
      );
    }
    if (typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.send(
        sendProblem(reply, request, {
          detail: "The request could not be processed by this endpoint.",
          instance: request.url,
          status: error.statusCode,
          title: "Request rejected",
          type: `urn:nivalis:problem:http-${error.statusCode}`
        })
      );
    }

    request.log.error(
      {
        error: {
          code: typeof error.code === "string" ? error.code : undefined,
          message: error.message,
          name: error.name
        }
      },
      "Unhandled API request failure"
    );
    return reply.send(
      sendProblem(reply, request, {
        detail: "The API could not complete the request.",
        instance: request.url,
        status: 500,
        title: "Internal server error",
        type: "urn:nivalis:problem:internal-server-error"
      })
    );
  });
}
