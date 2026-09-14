import { randomUUID } from "node:crypto";

/**
 * Generates a single requestId for the lifetime of one logical request.
 * Route handlers must call this exactly once per request and thread the
 * same value through logs and the response envelope (contract section 25).
 */
export function createRequestId(): string {
  return randomUUID();
}
