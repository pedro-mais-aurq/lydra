import { comparisonApi, asProductError } from "./api";
import type { ComparisonDetail, ProductError } from "./api";

const pending = new Map<string, Promise<void>>();
const failures = new Map<string, ProductError>();
type RetryRecord = { updatedAt: string; code: string; retryable: boolean; requestId: string | null };
const retryMemory = new Map<string, RetryRecord>();
function key(id: string) { return `lydra:process-error:${id}`; }
export function rememberFailure(detail: ComparisonDetail, error: ProductError) {
  if (detail.status !== "failed" || detail.errorCode !== error.code) return;
  const value = { updatedAt: detail.updatedAt, code: error.code, retryable: error.retryable, requestId: error.requestId };
  retryMemory.set(detail.id, value);
  try { sessionStorage.setItem(key(detail.id), JSON.stringify(value)); } catch { /* Memory still supports this page. */ }
}
export function retryFor(detail: ComparisonDetail): RetryRecord | null {
  let record: unknown = retryMemory.get(detail.id);
  try { const saved = sessionStorage.getItem(key(detail.id)); if (saved) record = JSON.parse(saved); } catch { /* Storage may be disabled. */ }
  if (!record || typeof record !== "object" || !("updatedAt" in record) || !("code" in record) || !("retryable" in record) || !("requestId" in record)) return null;
  if (detail.status !== "failed" || record.updatedAt !== detail.updatedAt || record.code !== detail.errorCode || typeof record.code !== "string" || typeof record.retryable !== "boolean" || !(record.requestId === null || typeof record.requestId === "string")) return null;
  return { updatedAt: record.updatedAt, code: record.code, retryable: record.retryable, requestId: record.requestId };
}
export function pendingProcess(id: string) { return pending.get(id); }
export function processFailure(id: string) { return failures.get(id); }
/** Called only by explicit user intent, never by mounting either detail route. */
export function startProcessing(id: string): Promise<void> {
  const existing = pending.get(id); if (existing) return existing;
  failures.delete(id); retryMemory.delete(id);
  try { sessionStorage.removeItem(key(id)); } catch { /* Optional UX cache, never identity. */ }
  const task = (async () => {
    try { await comparisonApi.process(id); }
    catch (error) {
      const failure = asProductError(error); failures.set(id, failure);
      try { rememberFailure(await comparisonApi.get(id), failure); } catch { /* GET remains retryable as a read. */ }
    }
  })().finally(() => { pending.delete(id); });
  pending.set(id, task); return task;
}

/** Serial, cancellable, bounded polling; no request can overlap another read. */
export function watchComparison(id: string, callbacks: {
  onData: (data: ComparisonDetail) => void;
  onError: (error: ProductError) => void;
  onPaused: () => void;
}, options: { interval?: number; maxReads?: number; read?: typeof comparisonApi.get } = {}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reads = 0;
  const run = async () => {
    try {
      const data = await (options.read ?? comparisonApi.get)(id, controller.signal);
      if (controller.signal.aborted) return;
      callbacks.onData(data); reads++;
      const active = data.status === "processing" || (data.status !== "completed" && Boolean(pendingProcess(id)));
      if (!active) return;
      if (reads >= (options.maxReads ?? 120)) { callbacks.onPaused(); return; }
      timer = setTimeout(() => { void run(); }, options.interval ?? 2500);
    } catch (error) {
      if (!controller.signal.aborted) callbacks.onError(asProductError(error));
    }
  };
  void run();
  return () => { controller.abort(); clearTimeout(timer); };
}
