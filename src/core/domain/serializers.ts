import type { Comparison, QuoteDocument } from "@/core/domain/types";

/**
 * Wire representation of a Comparison. Currently 1:1 with the domain type -
 * kept as an explicit pass-through (not the raw DB row) so a future field
 * added to the table doesn't leak into the API without a deliberate change
 * here.
 */
export function serializeComparison(comparison: Comparison) {
  return {
    id: comparison.id,
    title: comparison.title,
    status: comparison.status,
    result: comparison.result,
    errorCode: comparison.errorCode,
    createdAt: comparison.createdAt,
    updatedAt: comparison.updatedAt,
  };
}

/**
 * Wire representation of a QuoteDocument. storage_path is intentionally
 * omitted: it's an internal Storage key, not something the client needs, and
 * exposing it doesn't grant access anyway since the bucket is private - but
 * there's no reason to widen the surface for no benefit.
 */
export function serializeQuoteDocument(document: QuoteDocument) {
  return {
    id: document.id,
    comparisonId: document.comparisonId,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    extractedData: document.extractedData,
    extractionSchemaVersion: document.extractionSchemaVersion,
    errorCode: document.errorCode,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
