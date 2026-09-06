import { ProviderSchemaMismatchError } from "@nivalis/domain";

export function object(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderSchemaMismatchError(source);
  return value as Record<string, unknown>;
}
export function integer(value: unknown, source: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new ProviderSchemaMismatchError(source);
  return value;
}
