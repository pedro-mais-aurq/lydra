import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors/app-error";
import { ExtractionService, type ExtractionProvider } from "@/modules/extraction";
import { context, fixture, lease, mockStore, scope } from "../../fixtures/extraction/helpers";

beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());

describe("B service boundary and document lifecycle", () => {
  it("validates and persists one document with its exact scope", async () => {
    const store = mockStore();
    const provider = { extract: vi.fn<ExtractionProvider["extract"]>().mockResolvedValue(fixture().expected) };
    const result = await new ExtractionService(store, provider).extract(context);
    expect(result).toEqual(fixture().expected);
    expect(provider.extract).toHaveBeenCalledOnce();
    expect(store.loadDocument).toHaveBeenCalledWith(scope);
    expect(store.markProcessing).toHaveBeenCalledWith(scope);
    expect(store.downloadDocument).toHaveBeenCalledWith(scope);
    expect(store.saveCompletedExtraction).toHaveBeenCalledWith(scope, lease, result);
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(store.markProcessing.mock.invocationCallOrder[0]).toBeLessThan(provider.extract.mock.invocationCallOrder[0] ?? 0);
    expect(provider.extract.mock.invocationCallOrder[0]).toBeLessThan(store.saveCompletedExtraction.mock.invocationCallOrder[0] ?? 0);
  });

  it("B21 revalidates completed and reuses it without creating provider or reading Storage", async () => {
    const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "completed", extractedData: fixture().expected, extractionSchemaVersion: 1 });
    const factory = vi.fn<() => ExtractionProvider>(() => { throw new Error("No credentials available."); });
    expect(await new ExtractionService(store, factory).extract(context)).toEqual(fixture().expected);
    expect(factory).not.toHaveBeenCalled();
    expect(store.downloadDocument).not.toHaveBeenCalled();
    expect(store.markProcessing).not.toHaveBeenCalled();
    expect(store.saveCompletedExtraction).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it.each([null, {}, { ...fixture().expected, displayedTotal: 1 }, { ...fixture().expected, confidence: 1 }])("B22 rejects invalid completed JSON without reprocessing/mutation", async extractedData => {
    const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "completed", extractedData, extractionSchemaVersion: 1 });
    const provider = { extract: vi.fn<ExtractionProvider["extract"]>() };
    await expect(new ExtractionService(store, provider).extract(context)).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(provider.extract).not.toHaveBeenCalled();
    expect(store.markProcessing).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it.each([null, "1", 2, undefined])("rejects a completed version mismatch (%s)", async extractionSchemaVersion => {
    const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "completed", extractedData: fixture().expected, extractionSchemaVersion });
    await expect(new ExtractionService(store, { extract: vi.fn() }).extract(context)).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
  });

  it("rejects processing instead of calling provider twice", async () => {
    const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "processing", extractedData: null, extractionSchemaVersion: null });
    const provider = { extract: vi.fn<ExtractionProvider["extract"]>() };
    await expect(new ExtractionService(store, provider).extract(context)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(provider.extract).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("allows an explicit retry from failed", async () => {
    const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "failed", extractedData: null, extractionSchemaVersion: null });
    expect(await new ExtractionService(store, { extract: async () => fixture().expected }).extract(context)).toEqual(fixture().expected);
    expect(store.markProcessing).toHaveBeenCalledOnce();
  });

  it("does not hide incompatible data on a non-completed document", async () => {
    const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "uploaded", extractedData: fixture().expected, extractionSchemaVersion: 1 });
    await expect(new ExtractionService(store, { extract: vi.fn() }).extract(context)).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(store.markProcessing).not.toHaveBeenCalled();
  });

  it("marks invalid provider output failed and never persists raw output", async () => {
    const store = mockStore();
    const raw = { ...fixture().expected, confidence: 0.99, rawSecret: "sensitive" };
    await expect(new ExtractionService(store, { extract: async () => raw }).extract(context)).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(store.saveCompletedExtraction).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(scope, lease, "EXTRACTION_INVALID");
  });

  it("B23 sanitizes exceptions, even typed provider errors, and logs only technical fields", async () => {
    const store = mockStore();
    const maliciousError = new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "JWT_COOKIE_API_KEY_DOCUMENT_CONTENT", retryable: true, status: 502, details: fixture().expected });
    const provider = { extract: vi.fn<ExtractionProvider["extract"]>().mockRejectedValue(maliciousError) };
    const error: unknown = await new ExtractionService(store, provider).extract(context).catch(e => e);
    expect(error).toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true, details: null });
    expect(String(error)).not.toContain("JWT_COOKIE_API_KEY_DOCUMENT_CONTENT");
    const logs = vi.mocked(console.log).mock.calls;
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toMatch(/JWT_COOKIE_API_KEY_DOCUMENT_CONTENT|Fornecedor A|4\.500|supplierName/);
    for (const args of logs) {
      const entry: unknown = JSON.parse(String(args[0]));
      expect(entry).toEqual(expect.objectContaining({ requestId: context.requestId, documentId: context.documentId, comparisonId: context.comparisonId }));
      expect(Object.keys(Object(entry))).toEqual(expect.arrayContaining(["ts", "requestId", "comparisonId", "documentId", "stage", "durationMs"]));
      expect(Object.keys(Object(entry)).every(key => ["ts", "requestId", "comparisonId", "documentId", "stage", "durationMs", "errorCode"].includes(key))).toBe(true);
    }
  });

  it("preserves original failure if marking failed also fails", async () => {
    const store = mockStore();
    store.markFailed.mockRejectedValue(new Error("service-role-secret"));
    await expect(new ExtractionService(store, { extract: async () => { throw new Error("provider-secret"); } }).extract(context)).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).toContain("extraction.failure_persistence_failed");
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("secret");
  });

  it("does not return successful output if saving it fails", async () => {
    const store = mockStore();
    store.saveCompletedExtraction.mockRejectedValue(new Error("database-secret"));
    await expect(new ExtractionService(store, { extract: async () => fixture().expected }).extract(context)).rejects.toMatchObject({ code: "INTERNAL_ERROR", retryable: true });
    expect(store.markFailed).toHaveBeenCalledWith(scope, lease, "INTERNAL_ERROR");
  });

  it("does not call provider or mutate after load/claim failure", async () => {
    for (const failure of ["loadDocument", "markProcessing"] as const) {
      const store = mockStore();
      store[failure].mockRejectedValue(new Error("DB secret"));
      const provider = { extract: vi.fn<ExtractionProvider["extract"]>() };
      await expect(new ExtractionService(store, provider).extract(context)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
      expect(provider.extract).not.toHaveBeenCalled();
      expect(store.markFailed).not.toHaveBeenCalled();
    }
  });

  it("rejects forged/missing context before logging or reading privileged data", async () => {
    const store = mockStore();
    await expect(new ExtractionService(store, { extract: vi.fn() }).extract({ ...context, ownerId: "browser-secret" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.loadDocument).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
