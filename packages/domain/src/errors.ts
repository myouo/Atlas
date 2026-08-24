export abstract class NivalisError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DashboardNotFoundError extends NivalisError {
  readonly code = "dashboard-not-found";

  constructor(readonly dashboardSlug: string) {
    super(`Dashboard '${dashboardSlug}' was not found.`);
  }
}

export class DashboardRevisionNotFoundError extends NivalisError {
  readonly code = "dashboard-revision-not-found";

  constructor(readonly revisionId: string) {
    super(`Dashboard revision '${revisionId}' was not found.`);
  }
}

export class RevisionConflictError extends NivalisError {
  readonly code = "revision-conflict";

  constructor(
    readonly currentRevisionId: string,
    readonly currentRevisionNumber: number
  ) {
    super("The Dashboard Draft has changed since it was loaded.");
  }
}

export class SyncRunNotFoundError extends NivalisError {
  readonly code = "sync-run-not-found";

  constructor(readonly syncRunId: string) {
    super(`SyncRun '${syncRunId}' was not found.`);
  }
}

export class RawSnapshotNotFoundError extends NivalisError {
  readonly code = "raw-snapshot-not-found";

  constructor(readonly snapshotId: string) {
    super(`Raw Snapshot '${snapshotId}' was not found.`);
  }
}

export class ProviderNotConfiguredError extends NivalisError {
  readonly code = "provider-not-configured";

  constructor(readonly provider: string) {
    super(`Provider '${provider}' is not configured for synchronization.`);
  }
}

export class UnauthenticatedError extends NivalisError {
  readonly code = "unauthenticated";

  constructor() {
    super("A valid Nivalis session is required.");
  }
}

export class ForbiddenError extends NivalisError {
  readonly code = "forbidden";

  constructor() {
    super("The authenticated Actor is not the Nivalis Owner.");
  }
}

export class InvalidAuthTransactionError extends NivalisError {
  readonly code = "invalid-auth-transaction";

  constructor() {
    super("The OAuth transaction is invalid, expired, or already used.");
  }
}

export class ExternalAuthenticationError extends NivalisError {
  readonly code = "external-authentication-failed";

  constructor() {
    super("The external identity provider could not complete authentication.");
  }
}

export abstract class SyncPipelineError extends NivalisError {
  abstract readonly retryable: boolean;

  constructor(message: string) {
    super(message);
  }
}

export class RetryableProviderError extends SyncPipelineError {
  readonly code = "retryable-provider-error";
  readonly retryable = true;

  constructor(
    message: string,
    readonly diagnosticCode: string | null = null
  ) {
    super(message);
  }
}

export class PermanentProviderError extends SyncPipelineError {
  readonly code = "permanent-provider-error";
  readonly retryable = false;
}

export class ProviderCredentialError extends SyncPipelineError {
  readonly code = "provider-credential-error";
  readonly retryable = false;

  constructor(
    readonly credentialStatus: "expired" | "invalid",
    message = "The Provider credential is invalid or expired."
  ) {
    super(message);
  }
}

export class ProviderSchemaMismatchError extends SyncPipelineError {
  readonly code = "provider-schema-mismatch";
  readonly retryable = false;

  constructor(readonly sourceKind: string) {
    super(`The Provider response for '${sourceKind}' did not match the expected schema.`);
  }
}

export class NormalizationError extends SyncPipelineError {
  readonly code = "normalization-error";
  readonly retryable = false;
}

export class ProjectionError extends SyncPipelineError {
  readonly code = "projection-error";
  readonly retryable = false;
}

export class RawSnapshotSanitizationError extends SyncPipelineError {
  readonly code = "raw-snapshot-sanitization-error";
  readonly retryable = false;
}

export class ProviderConnectionNotFoundError extends NivalisError {
  readonly code = "provider-connection-not-found";

  constructor(readonly provider: string) {
    super(`Provider connection '${provider}' was not found.`);
  }
}

export class ProviderAuthAttemptNotFoundError extends NivalisError {
  readonly code = "provider-auth-attempt-not-found";

  constructor(readonly attemptId: string) {
    super(`Provider authentication attempt '${attemptId}' was not found.`);
  }
}

export class ProviderAuthAttemptStateError extends NivalisError {
  readonly code = "provider-auth-attempt-state";

  constructor(message = "The Provider authentication attempt cannot accept this operation.") {
    super(message);
  }
}

export class ProviderAuthenticationError extends NivalisError {
  readonly code = "provider-authentication-failed";

  constructor(
    readonly reason: "credential_missing" | "invalid_code" | "provider_rejected" | "risk_control"
  ) {
    super("The Provider could not complete authentication.");
  }
}

export class InvalidProviderCredentialError extends NivalisError {
  readonly code = "invalid-provider-credential";

  constructor() {
    super("The Provider credential input is invalid.");
  }
}

export class WidgetNotFoundError extends NivalisError {
  readonly code = "widget-not-found";

  constructor(readonly widgetId: string) {
    super(`Widget '${widgetId}' was not found in the current Draft.`);
  }
}

export class WidgetAlreadyExistsError extends NivalisError {
  readonly code = "widget-already-exists";

  constructor(readonly widgetId: string) {
    super(`Widget '${widgetId}' already exists in the current Draft.`);
  }
}

export class InvalidDashboardError extends NivalisError {
  readonly code = "invalid-dashboard";

  constructor(readonly issues: readonly string[]) {
    super("Dashboard state is invalid.");
  }
}

export class OwnerWritesDisabledError extends NivalisError {
  readonly code = "owner-writes-disabled";

  constructor() {
    super("Owner write endpoints are disabled until an authenticated owner context is available.");
  }
}
