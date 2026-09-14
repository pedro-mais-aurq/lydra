import { afterEach, describe, it, expect, vi } from "vitest";
import { watchComparison, startProcessing, retryFor, rememberFailure } from "@/modules/product/processing";
import { comparisonApi, ProductError, type ComparisonDetail } from "@/modules/product/api";
import { completedDetail } from "../../fixtures/product";
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("product processing and retry", () => {
  it("deduplicates explicit process, preserves retryable and uses same comparison", async () => {
    const detail = { ...completedDetail(), status: "failed" as const, result: null, errorCode: "EXTRACTION_PROVIDER_ERROR" };
    const process = vi.spyOn(comparisonApi, "process").mockRejectedValue(new ProductError("EXTRACTION_PROVIDER_ERROR", true, "request"));
    vi.spyOn(comparisonApi, "get").mockResolvedValue(detail);
    const first = startProcessing(detail.id); expect(startProcessing(detail.id)).toBe(first); await first;
    expect(process).toHaveBeenCalledExactlyOnceWith(detail.id); expect(retryFor(detail)?.retryable).toBe(true);
    expect(retryFor({ ...detail, updatedAt: "different-attempt" })).toBeNull();
    rememberFailure(detail, new ProductError("EXTRACTION_PROVIDER_ERROR", false)); expect(retryFor(detail)?.retryable).toBe(false);
  });
  it("never infers retry permission from a persisted error code", () => {
    expect(retryFor({ ...completedDetail(), id: "70000000-0000-4000-8000-000000000000", status: "failed", errorCode: "EXTRACTION_PROVIDER_ERROR" })).toBeNull();
  });
  it.each(["completed", "failed", "draft"] as const)("direct %s stops polling and never starts process", async (status) => {
    vi.useFakeTimers(); const process = vi.spyOn(comparisonApi, "process"); const read = vi.fn().mockResolvedValue({ ...completedDetail(), status });
    const onData = vi.fn(); const cancel = watchComparison("id", { onData, onError: vi.fn(), onPaused: vi.fn() }, { read });
    await vi.runAllTimersAsync(); expect(read).toHaveBeenCalledTimes(1); expect(onData).toHaveBeenCalledTimes(1); expect(process).not.toHaveBeenCalled(); cancel();
  });
  it("polls processing serially, stops on completion and bounds long-running work", async () => {
    vi.useFakeTimers(); const detail = completedDetail(); const read = vi.fn().mockResolvedValueOnce({ ...detail, status: "processing" }).mockResolvedValue(detail);
    const cancel = watchComparison("id", { onData: vi.fn(), onError: vi.fn(), onPaused: vi.fn() }, { read });
    await vi.runAllTimersAsync(); expect(read).toHaveBeenCalledTimes(2); cancel();
    const onPaused = vi.fn(); const stuckRead = vi.fn().mockResolvedValue({ ...detail, status: "processing" });
    const stop = watchComparison("id", { onData: vi.fn(), onError: vi.fn(), onPaused }, { read: stuckRead, maxReads: 3 });
    await vi.runAllTimersAsync(); expect(stuckRead).toHaveBeenCalledTimes(3); expect(onPaused).toHaveBeenCalledTimes(1); stop();
  });
  it("aborts on unmount and ignores a late read", async () => {
    let resolve!: (value: ComparisonDetail) => void;
    const read = vi.fn().mockReturnValue(new Promise<ComparisonDetail>((done) => { resolve = done; })); const onData = vi.fn();
    const cancel = watchComparison("id", { onData, onError: vi.fn(), onPaused: vi.fn() }, { read }); cancel(); resolve(completedDetail());
    await Promise.resolve(); expect(onData).not.toHaveBeenCalled(); expect(read.mock.calls[0]?.[1].aborted).toBe(true);
  });
});
