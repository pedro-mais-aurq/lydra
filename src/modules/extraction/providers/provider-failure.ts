import "server-only";
import { z } from "zod";

/**
 * Conservative, isolated classification of a `status: "failed"` Responses API
 * result. This never inspects anything beyond the provider's own error
 * object, never throws, and never returns the raw error to callers — only a
 * retryable boolean. Unknown or absent error codes are treated as permanent
 * (retryable = false) so we never spin on a failure mode we don't recognize.
 */

const providerErrorShape = z.object({ code: z.unknown().optional(), type: z.unknown().optional() }).passthrough();

/** Documented, clearly transient failure codes reported by the provider. */
const TRANSIENT_FAILURE_CODES: ReadonlySet<string> = new Set([
  "server_error",
  "internal_error",
  "internal_server_error",
  "rate_limit",
  "rate_limit_exceeded",
  "temporarily_unavailable",
  "service_unavailable",
  "timeout",
  "request_timeout",
  "overloaded",
  "engine_overloaded",
  "connection_error",
]);

/** Documented, clearly permanent failure codes: retrying without changing the request cannot succeed. */
const PERMANENT_FAILURE_CODES: ReadonlySet<string> = new Set([
  "invalid_request",
  "invalid_request_error",
  "unsupported_input",
  "invalid_parameter",
  "invalid_prompt",
  "content_policy_violation",
  "context_length_exceeded",
  "invalid_image",
  "invalid_file",
  "model_not_found",
]);

/**
 * HTTP 429 specifically can mean two very different things: a transient
 * rate limit (retrying later helps) or an exhausted quota/billing limit
 * (retrying never helps until the account is topped up). These codes are
 * the documented, unambiguous signal for the latter.
 */
const PERSISTENT_429_CODES: ReadonlySet<string> = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "billing_hard_limit_reached",
  "usage_limit_reached",
  "quota_exceeded",
  "organization_usage_limit_exceeded",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
]);

const httpErrorEnvelope = z.object({ error: z.unknown().optional() }).passthrough();

function normalizedCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Safely extracts every usable signal — `code` AND `type`, independently,
 * never one masking the other — from a provider error object shaped like
 * `{ code, type }`. Never coerces non-strings (no `String()`/`toString()`/
 * template interpolation on untrusted values); a field that isn't a
 * non-empty string simply contributes no signal.
 */
function extractProviderErrorSignals(error: unknown): string[] {
  const parsed = providerErrorShape.safeParse(error);
  if (!parsed.success) return [];
  const signals: string[] = [];
  const code = normalizedCode(parsed.data.code);
  if (code !== null) signals.push(code);
  const type = normalizedCode(parsed.data.type);
  if (type !== null) signals.push(type);
  return signals;
}

/** Same independent code+type extraction, for an HTTP error body shaped like `{ error: { code, type } }`. */
function extractHttpErrorSignals(body: unknown): string[] {
  const parsed = httpErrorEnvelope.safeParse(body);
  if (!parsed.success) return [];
  return extractProviderErrorSignals(parsed.data.error);
}

/**
 * Classifies a set of extracted signals against a persistent/transient pair
 * of code sets, with persistent taking precedence over transient when both
 * are present (an explicit quota/billing condition must win over a generic
 * transient-looking signal on the same error). Falls back to `fallback`
 * when no recognized signal is present at all.
 */
function classifyBySignals(signals: readonly string[], persistent: ReadonlySet<string>, transient: ReadonlySet<string>, fallback: boolean): boolean {
  if (signals.some(signal => persistent.has(signal))) return false;
  if (signals.some(signal => transient.has(signal))) return true;
  return fallback;
}

/**
 * Given the (untyped, provider-controlled) `error` field of a failed
 * Responses API result, decides whether the failure is retryable.
 *
 * Conservative by construction: only codes we explicitly recognize as
 * transient return true. Everything else — permanent codes, unknown codes,
 * missing/malformed error objects — returns false. This fallback is
 * intentionally different from the HTTP 429 fallback below: a `failed`
 * status carries no baseline "too many requests" meaning to fall back on.
 */
export function isRetryableProviderFailure(error: unknown): boolean {
  const signals = extractProviderErrorSignals(error);
  return classifyBySignals(signals, PERMANENT_FAILURE_CODES, TRANSIENT_FAILURE_CODES, false);
}

/**
 * Classifies a non-2xx HTTP response from the provider. `errorBody` is the
 * (already, leniently parsed) HTTP response body — possibly `undefined` if
 * it couldn't be read or parsed, which contributes no signal.
 *
 * 408 and 5xx are unconditionally transient. 429 needs its error signals
 * inspected — `code` and `type` are both extracted and both considered,
 * with a persistent quota/billing signal always winning over a transient
 * one on the same error. An unrecognized/absent signal defaults to
 * retryable = true — HTTP 429's primary meaning is still "too many
 * requests", and any actual retry policy belongs to the future
 * orchestrator (Part C), not to this classification.
 */
export function classifyHttpProviderFailure(status: number, errorBody: unknown): boolean {
  if (status === 408) return true;
  if (status >= 500) return true;
  if (status === 429) {
    const signals = extractHttpErrorSignals(errorBody);
    return classifyBySignals(signals, PERSISTENT_429_CODES, TRANSIENT_FAILURE_CODES, true);
  }
  return false;
}
