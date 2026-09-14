import { vi } from "vitest";
import type { Comparison, QuoteDocument } from "@/core/domain/types";
import { AppError } from "@/core/errors/app-error";
import type { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import type { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { ExtractionService, type ExtractionProvider, type ExtractionStore } from "@/modules/extraction";
import { repositoryExtractionStore } from "@/modules/comparison/b3-extraction-adapter";
import { processComparison, type ProcessDependencies } from "@/modules/comparison/process";
import { canonicalQuotes, ids } from "./comparison";
import { context, fixture, pdfInput } from "./extraction/helpers";

/** Unit-only state fixture. It models transition outcomes, NOT real DB locking. */
export function processHarness(count = 2, status: Comparison["status"] = "draft") {
  let sequence = 0;
  const stamp = () => `2026-09-13T00:00:00.${String(++sequence).padStart(6, "0")}+00:00`;
  const comparison: Comparison = {
    id: context.comparisonId, ownerId: context.ownerId, title: "Fixture", status, result: null,
    errorCode: null, createdAt: stamp(), updatedAt: stamp(),
  };
  const documents: QuoteDocument[] = ids.slice(0, count).map(id => ({
    id, comparisonId: comparison.id, ownerId: comparison.ownerId, fileName: "quote.pdf",
    storagePath: `${comparison.ownerId}/${comparison.id}/${id}/quote.pdf`, mimeType: "application/pdf", sizeBytes: pdfInput().bytes.length,
    status: "uploaded", extractedData: null, extractionSchemaVersion: null, errorCode: null, createdAt: stamp(), updatedAt: stamp(),
  }));
  const conflict = () => new AppError({ code: "INVALID_COMPARISON_STATE", message: "Fixture conflict", status: 409, retryable: false });
  const find = (scope: { ownerId: string; comparisonId: string; documentId: string }) => {
    const row = documents.find(d => d.id === scope.documentId && d.ownerId === scope.ownerId && d.comparisonId === scope.comparisonId);
    if (!row) throw conflict(); return row;
  };
  const comparisonRepository = {
    findByIdForOwner: vi.fn<ComparisonRepository["findByIdForOwner"]>().mockImplementation(async p => p.ownerId === comparison.ownerId && p.id === comparison.id ? structuredClone(comparison) : null),
    tryAcquireProcessing: vi.fn<ComparisonRepository["tryAcquireProcessing"]>().mockImplementation(async p => {
      if (p.id !== comparison.id || p.ownerId !== comparison.ownerId || !["draft", "failed"].includes(comparison.status)) return null;
      Object.assign(comparison, { status: "processing", result: null, errorCode: null, updatedAt: stamp() });
      return structuredClone(comparison);
    }),
    completeProcessing: vi.fn<ComparisonRepository["completeProcessing"]>().mockImplementation(async p => {
      if (p.id !== comparison.id || p.ownerId !== comparison.ownerId || comparison.status !== "processing" || p.updatedAt !== comparison.updatedAt) throw conflict();
      Object.assign(comparison, { status: "completed", result: p.result, errorCode: null, updatedAt: stamp() });
      return structuredClone(comparison);
    }),
    failProcessing: vi.fn<ComparisonRepository["failProcessing"]>().mockImplementation(async p => {
      if (p.id !== comparison.id || p.ownerId !== comparison.ownerId || comparison.status !== "processing" || p.updatedAt !== comparison.updatedAt) throw conflict();
      Object.assign(comparison, { status: "failed", result: null, errorCode: p.errorCode, updatedAt: stamp() });
    }),
  };
  const documentRepository = {
    listForComparison: vi.fn<QuoteDocumentRepository["listForComparison"]>().mockImplementation(async (comparisonId, ownerId) => structuredClone(documents.filter(d => d.comparisonId === comparisonId && d.ownerId === ownerId))),
    markProcessing: vi.fn<QuoteDocumentRepository["markProcessing"]>().mockImplementation(async p => {
      const row = find(p); if (!["uploaded", "failed"].includes(row.status)) throw conflict();
      Object.assign(row, { status: "processing", extractedData: null, extractionSchemaVersion: null, errorCode: null, updatedAt: stamp() });
      return structuredClone(row);
    }),
    completeExtraction: vi.fn<QuoteDocumentRepository["completeExtraction"]>().mockImplementation(async p => {
      const row = find(p); if (row.status !== "processing" || p.updatedAt !== row.updatedAt) throw conflict();
      Object.assign(row, { status: "completed", extractedData: p.extraction, extractionSchemaVersion: 1, errorCode: null, updatedAt: stamp() });
      return structuredClone(row);
    }),
    markFailed: vi.fn<QuoteDocumentRepository["markFailed"]>().mockImplementation(async p => {
      const row = find(p); if (row.status !== "processing" || p.updatedAt !== row.updatedAt) throw conflict();
      Object.assign(row, { status: "failed", extractedData: null, extractionSchemaVersion: null, errorCode: p.errorCode, updatedAt: stamp() });
    }),
  };
  const source = {
    loadDocument: vi.fn<ExtractionStore["loadDocument"]>().mockImplementation(async scope => {
      const row = find(scope); return { status: row.status, extractedData: row.extractedData, extractionSchemaVersion: row.extractionSchemaVersion };
    }),
    downloadDocument: vi.fn<ExtractionStore["downloadDocument"]>().mockResolvedValue(pdfInput()),
  };
  const provider = { extract: vi.fn<ExtractionProvider["extract"]>().mockResolvedValue(fixture().expected) };
  const extractionPort = new ExtractionService(repositoryExtractionStore(documentRepository, source), provider);
  const run = (overrides: Partial<ProcessDependencies & { ownerId: string; comparisonId: string }> = {}) => processComparison({
    ownerId: comparison.ownerId, comparisonId: comparison.id, requestId: context.requestId,
    comparisonRepository, documentRepository, extractionPort, ...overrides,
  });
  const complete = (index: number) => {
    const document = documents[index]; if (!document) throw new Error("Unknown fixture index");
    Object.assign(document, { status: "completed", extractedData: canonicalQuotes()[index % 3]?.quote ?? fixture().expected, extractionSchemaVersion: 1, errorCode: null });
  };
  return { comparison, documents, comparisonRepository, documentRepository, extractionPort, source, provider, run, complete };
}
