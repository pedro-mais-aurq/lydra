import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors/app-error";
import { compareQuotes } from "@/modules/comparison/engine";
import { processHarness } from "../fixtures/comparison-process";
import { fixture } from "../fixtures/extraction/helpers";
import { ids } from "../fixtures/comparison";

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, "log").mockImplementation(() => {}); });

describe("process orchestration with the real B.3 service and unit-only repositories/provider", () => {
  it.each(["draft", "failed"] as const)("%s -> processing -> completed", async status => {
    const h = processHarness(2, status); const result = await h.run();
    expect(result.status).toBe("completed"); expect(result.result).not.toBeNull(); expect(result.errorCode).toBeNull();
    expect(h.documents.every(d => d.status === "completed" && d.extractionSchemaVersion === 1)).toBe(true);
    expect(h.provider.extract).toHaveBeenCalledTimes(2);
  });
  it.each(["completed", "processing"] as const)("rejects %s without side effects", async status => {
    const h = processHarness(2, status); const before = structuredClone(h.comparison);
    await expect(h.run()).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.comparison).toEqual(before); expect(h.provider.extract).not.toHaveBeenCalled();
    expect(h.comparisonRepository.tryAcquireProcessing).not.toHaveBeenCalled();
  });
  it.each([0, 1, 5])("rejects %s documents before acquiring", async count => {
    const h = processHarness(count);
    await expect(h.run()).rejects.toMatchObject({ code: count < 2 ? "TOO_FEW_DOCUMENTS" : "TOO_MANY_DOCUMENTS" });
    expect(h.comparisonRepository.tryAcquireProcessing).not.toHaveBeenCalled();
  });
  it.each([2, 4])("accepts %s documents", async count => {
    const h = processHarness(count); await expect(h.run()).resolves.toMatchObject({ status: "completed" });
    expect(h.provider.extract).toHaveBeenCalledTimes(count);
  });
  it("keeps cross-owner indistinguishable from absence", async () => {
    const h = processHarness();
    await expect(h.run({ ownerId: ids[4] })).rejects.toMatchObject({ code: "COMPARISON_NOT_FOUND", status: 404 });
    expect(h.documentRepository.listForComparison).not.toHaveBeenCalled();
    expect(h.provider.extract).not.toHaveBeenCalled();
  });
  it("reuses completed A and extracts B once before one engine call", async () => {
    const h = processHarness(); h.complete(0); const engine = vi.fn(compareQuotes);
    await h.run({ engine });
    expect(h.provider.extract).toHaveBeenCalledTimes(1); expect(engine).toHaveBeenCalledTimes(1);
    expect(h.source.loadDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: ids[1] }));
    expect(h.source.loadDocument).not.toHaveBeenCalledWith(expect.objectContaining({ documentId: ids[0] }));
  });
  it("completes all pre-extracted documents with no extractor or AI configuration", async () => {
    const h = processHarness(); h.complete(0); h.complete(1);
    await expect(h.run({ extractionPort: undefined })).resolves.toMatchObject({ status: "completed" });
    expect(h.provider.extract).not.toHaveBeenCalled(); expect(h.source.downloadDocument).not.toHaveBeenCalled();
  });
  it("fails explicitly if new extraction is needed and no real port exists", async () => {
    const h = processHarness();
    await expect(h.run({ extractionPort: undefined })).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: false });
    expect(h.comparison.status).toBe("failed"); expect(h.comparison.result).toBeNull();
  });
  it("retries only failed B after A was persisted successfully", async () => {
    const h = processHarness(); const engine = vi.fn(compareQuotes);
    h.provider.extract.mockResolvedValueOnce(fixture().expected).mockRejectedValueOnce(new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "private", status: 502, retryable: true }));
    await expect(h.run({ engine })).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true });
    expect(h.documents.map(d => d.status)).toEqual(["completed", "failed"]);
    expect(h.comparison.status).toBe("failed"); expect(engine).not.toHaveBeenCalled();
    const persistedA = structuredClone(h.documents[0]);
    await expect(h.run({ engine })).resolves.toMatchObject({ status: "completed" });
    expect(h.documents[0]).toEqual(persistedA);
    expect(h.provider.extract).toHaveBeenCalledTimes(3); expect(engine).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("preserves B.3 provider retryable=%s without automatic retries", async retryable => {
    const h = processHarness(); h.provider.extract.mockRejectedValue(new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "secret raw response", details: "private", status: 502, retryable }));
    await expect(h.run()).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable, details: null });
    expect(h.provider.extract).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toMatch(/secret raw response|private/);
  });
  it.each(["EXTRACTION_INVALID", "EXTRACTION_UNSUPPORTED_INPUT"] as const)("preserves %s", async code => {
    const h = processHarness(); h.provider.extract.mockRejectedValue(new AppError({ code, message: "private", status: 422, retryable: false }));
    await expect(h.run()).rejects.toMatchObject({ code, retryable: false });
    expect(h.documents[0]).toMatchObject({ status: "failed", errorCode: code, extractedData: null, extractionSchemaVersion: null });
    expect(h.comparison).toMatchObject({ status: "failed", errorCode: code, result: null });
  });
  it("sanitizes an unexpected extraction exception", async () => {
    const h = processHarness();
    await expect(h.run({ extractionPort: { extract: async () => { throw new Error("PRIVATE SECRET SDK STACK"); } } })).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", details: null });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("PRIVATE SECRET");
  });
  it.each(["structure", "evidence", "version"])("rejects invalid reused %s without re-extraction", async kind => {
    const h = processHarness(); h.complete(0); h.complete(1);
    const document = h.documents[0]; if (!document?.extractedData) throw new Error("Fixture missing");
    if (kind === "structure") Reflect.deleteProperty(document.extractedData, "currency");
    if (kind === "evidence") document.extractedData.evidence.displayedTotal = null;
    if (kind === "version") document.extractionSchemaVersion = null;
    await expect(h.run()).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(h.provider.extract).not.toHaveBeenCalled(); expect(h.comparison.status).toBe("failed");
    expect(document.status).toBe("completed");
  });
  it("rejects an invalid extraction return even if an injected port lies about its type", async () => {
    const h = processHarness(); const invalidQuote = fixture().expected; Reflect.deleteProperty(invalidQuote, "currency");
    await expect(h.run({ extractionPort: { extract: async () => invalidQuote } })).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(h.comparisonRepository.completeProcessing).not.toHaveBeenCalled();
  });
  it("does not complete from an unpersisted extraction result", async () => {
    const h = processHarness();
    await expect(h.run({ extractionPort: { extract: async () => fixture().expected } })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.comparison.status).toBe("failed"); expect(h.comparisonRepository.completeProcessing).not.toHaveBeenCalled();
  });
  it.each(["throw", "invalid-result"])("maps engine %s to COMPARISON_ENGINE_ERROR", async kind => {
    const h = processHarness(); h.complete(0); h.complete(1);
    const engine = () => {
      if (kind === "throw") throw new Error("PRIVATE ENGINE CONTENT");
      const result = compareQuotes([{ documentId: ids[0], quote: fixture().expected }, { documentId: ids[1], quote: fixture().expected }]);
      Reflect.set(result, "bestSupplierId", ids[0]); return result;
    };
    await expect(h.run({ engine })).rejects.toMatchObject({ code: "COMPARISON_ENGINE_ERROR" });
    expect(h.comparison.status).toBe("failed"); expect(h.comparison.result).toBeNull();
    expect(h.comparisonRepository.completeProcessing).not.toHaveBeenCalled();
  });
  it("rereads and includes an upload completed before acquisition", async () => {
    const h = processHarness(3); h.complete(0); h.complete(1); h.complete(2);
    h.documentRepository.listForComparison.mockResolvedValueOnce(structuredClone(h.documents.slice(0, 2)));
    const result = await h.run(); expect(result.result?.suppliers).toHaveLength(3);
    expect(h.documentRepository.listForComparison).toHaveBeenCalledTimes(3);
  });
  it("validates stabilized limits again after acquiring", async () => {
    const h = processHarness(5);
    h.documentRepository.listForComparison.mockResolvedValueOnce(structuredClone(h.documents.slice(0, 2)));
    await expect(h.run()).rejects.toMatchObject({ code: "TOO_MANY_DOCUMENTS" });
    expect(h.comparison.status).toBe("failed"); expect(h.provider.extract).not.toHaveBeenCalled();
  });
  it("does not start extraction when another request acquires first", async () => {
    const h = processHarness(); h.comparisonRepository.tryAcquireProcessing.mockResolvedValue(null);
    await expect(h.run()).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.provider.extract).not.toHaveBeenCalled(); expect(h.comparisonRepository.failProcessing).not.toHaveBeenCalled();
  });
  it("does not hide original extraction error when failure persistence also fails", async () => {
    const h = processHarness(); h.provider.extract.mockRejectedValue(new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "PRIVATE", status: 502, retryable: false }));
    h.documentRepository.markFailed.mockRejectedValue(new Error("PRIVATE DATABASE"));
    h.comparisonRepository.failProcessing.mockRejectedValue(new Error("PRIVATE DATABASE"));
    await expect(h.run()).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: false });
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logs).toContain("failure_persistence_failed"); expect(logs).not.toContain("PRIVATE");
  });
  it("never reports success if persisting the result fails", async () => {
    const h = processHarness(); h.complete(0); h.complete(1);
    h.comparisonRepository.completeProcessing.mockRejectedValue(new AppError({ code: "INTERNAL_ERROR", message: "Failed persistence", status: 500, retryable: true }));
    await expect(h.run()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(h.comparison.status).toBe("failed"); expect(h.documents.every(d => d.status === "completed")).toBe(true);
  });
  it("recovers an orphan processing document only under a failed aggregate and fences its old attempt", async () => {
    const h = processHarness(2, "failed"); h.complete(0);
    const scope = { ownerId: h.comparison.ownerId, comparisonId: h.comparison.id, documentId: ids[1] };
    const old = await h.documentRepository.markProcessing(scope);
    await expect(h.run()).resolves.toMatchObject({ status: "completed" });
    await expect(h.documentRepository.completeExtraction({ ...scope, updatedAt: old.updatedAt, extraction: fixture().expected })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.provider.extract).toHaveBeenCalledTimes(1);
  });
  it("does not take over an interrupted processing aggregate based on an invented TTL", async () => {
    const h = processHarness(2, "processing"); h.comparison.updatedAt = "2000-01-01T00:00:00Z";
    await expect(h.run()).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.documentRepository.markFailed).not.toHaveBeenCalled();
  });
});
