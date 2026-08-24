const STRONG_REVISION_ETAG =
  /^"rev:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"$/i;

export class PreconditionRequiredHttpError extends Error {
  constructor() {
    super("This operation requires an If-Match header for the current Draft revision.");
    this.name = "PreconditionRequiredHttpError";
  }
}

export class InvalidRevisionEtagHttpError extends Error {
  constructor() {
    super("If-Match must contain one strong Nivalis revision ETag.");
    this.name = "InvalidRevisionEtagHttpError";
  }
}

export function formatRevisionEtag(revisionId: string) {
  return `"rev:${revisionId}"`;
}

export function formatViewEtag(viewVersion: string) {
  return `"view:${viewVersion}"`;
}

export function formatDataEtag(dataVersion: string) {
  return `"data:${dataVersion}"`;
}

export function parseRequiredRevisionEtag(value: string | string[] | undefined) {
  if (value === undefined) throw new PreconditionRequiredHttpError();
  if (Array.isArray(value)) throw new InvalidRevisionEtagHttpError();
  const match = STRONG_REVISION_ETAG.exec(value.trim());
  const revisionId = match?.[1];
  if (!revisionId) throw new InvalidRevisionEtagHttpError();
  return revisionId.toLowerCase();
}

export function encodeRevisionCursor(revisionNumber: number | null) {
  return revisionNumber === null ? null : `rev:${revisionNumber}`;
}
