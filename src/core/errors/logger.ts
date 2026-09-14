/**
 * Structured logging with an explicit, narrow field set. Contract section 26
 * forbids logging full file contents, extracted_data, result, tokens, JWTs,
 * cookies, service keys, prompts, or raw provider responses. Rather than
 * trusting every call site to remember that, this type only accepts the
 * fields that are known to be safe.
 */
export interface LogFields {
  requestId: string;
  comparisonId?: string;
  documentId?: string;
  stage: string;
  errorCode?: string;
  durationMs?: number;
}

export function logRequest(fields: LogFields): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}
