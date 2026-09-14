import "server-only";
import { comparisonResultSchema, extractedQuoteSchema, type AppErrorCode, type ComparisonResult } from "@/contracts";
import type { Comparison, QuoteDocument } from "@/core/domain/types";
import type { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import type { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { AppError } from "@/core/errors/app-error";
import { logRequest } from "@/core/errors/logger";
import { validateComparisonId } from "@/core/validation/schemas";
import { validateExtraction } from "@/modules/extraction";
import { compareQuotes } from "./engine";
import { compareIds, type QuoteInput } from "./normalize-items";
import type { QuoteExtractionPort } from "./extraction-port";

export type ProcessDependencies = {
  comparisonRepository: Pick<ComparisonRepository, "findByIdForOwner" | "tryAcquireProcessing" | "completeProcessing" | "failProcessing">;
  documentRepository: Pick<QuoteDocumentRepository, "listForComparison" | "markFailed">;
  extractionPort?: QuoteExtractionPort;
  engine?: (quotes: readonly QuoteInput[]) => ComparisonResult;
};
type ProcessInput = ProcessDependencies & { comparisonId: string; ownerId: string; requestId: string };
const conflict = () => new AppError({ code: "INVALID_COMPARISON_STATE", message: "Comparison is not available for this processing attempt.", status: 409, retryable: false });
const invalid = () => new AppError({ code: "EXTRACTION_INVALID", message: "A extração não atende ao contrato de dados e evidências.", status: 422, retryable: false });

function assertCount(count: number): void {
  if (count < 2) throw new AppError({ code: "TOO_FEW_DOCUMENTS", message: "At least 2 documents are required.", status: 422, retryable: false });
  if (count > 4) throw new AppError({ code: "TOO_MANY_DOCUMENTS", message: "At most 4 documents are permitted.", status: 422, retryable: false });
}

/** Don't forward injected/SDK messages, details, causes or raw provider codes.
 * B.3's retryable boolean survives; C never infers retryability from HTTP 429. */
function extractionError(error: unknown): AppError {
  if (error instanceof AppError) {
    if (error.code === "EXTRACTION_INVALID") return invalid();
    if (error.code === "EXTRACTION_UNSUPPORTED_INPUT") return new AppError({ code: error.code, message: "Documento incompatível com a extração.", status: 415, retryable: error.retryable });
    if (error.code === "EXTRACTION_PROVIDER_ERROR") return new AppError({ code: error.code, message: "Não foi possível executar a extração com o provider configurado.", status: error.status === 500 ? 500 : 502, retryable: error.retryable });
    if (error.code === "INVALID_COMPARISON_STATE") return conflict();
    if (error.code === "COMPARISON_NOT_FOUND") return new AppError({ code: error.code, message: "Comparison document not found.", status: 404, retryable: false });
    if (error.code === "INTERNAL_ERROR" || error.code === "VALIDATION_ERROR") return new AppError({ code: error.code, message: "Não foi possível acessar o documento para extração.", status: 500, retryable: error.retryable });
  }
  return new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "Não foi possível executar a extração.", status: 502, retryable: true });
}

function validatedDocument(document: QuoteDocument): QuoteInput {
  if (document.status !== "completed") throw conflict();
  if (document.extractionSchemaVersion !== 1) throw invalid();
  const parsed = extractedQuoteSchema.safeParse(document.extractedData);
  if (!parsed.success) throw invalid();
  // Reuse gets the SAME semantic/evidence checks as a new B.3 extraction.
  return { documentId: document.id, quote: validateExtraction(parsed.data) };
}

export async function processComparison(input: ProcessInput): Promise<Comparison> {
  const { ownerId, requestId, comparisonRepository, documentRepository, extractionPort } = input;
  const comparisonId = validateComparisonId(input.comparisonId);
  const scope = { id: comparisonId, ownerId };
  const comparison = await comparisonRepository.findByIdForOwner(scope);
  if (!comparison) throw new AppError({ code: "COMPARISON_NOT_FOUND", message: "Comparison not found.", status: 404, retryable: false });
  if (comparison.status !== "draft" && comparison.status !== "failed") throw conflict();
  const beforeLock = await documentRepository.listForComparison(comparisonId, ownerId);
  assertCount(beforeLock.length);
  // The SELECT above is advisory. ONLY this conditional DB UPDATE grants ownership.
  const acquired = await comparisonRepository.tryAcquireProcessing(scope);
  if (!acquired) throw conflict();
  const attempt = { ...scope, updatedAt: acquired.updatedAt };
  const start = performance.now();
  const log = (stage: string, errorCode?: AppErrorCode, documentId?: string) => logRequest({
    requestId, comparisonId, stage, ...(errorCode ? { errorCode } : {}),
    ...(documentId ? { documentId } : {}), durationMs: Math.round(performance.now() - start),
  });
  log("comparison.processing");
  try {
    // Required second read: includes uploads committed before the parent's lock.
    const documents = await documentRepository.listForComparison(comparisonId, ownerId);
    assertCount(documents.length);
    for (const document of [...documents].sort((a, b) => compareIds(a.id, b.id))) {
      if (document.status === "completed") { validatedDocument(document); log("comparison.extraction_reused", undefined, document.id); continue; }
      if (document.status === "processing") {
        if (comparison.status !== "failed") throw conflict();
        // A failed aggregate has relinquished its previous attempt. Invalidate an
        // orphan document's exact token before retry; never take over a processing aggregate.
        await documentRepository.markFailed({ ownerId, comparisonId, documentId: document.id, updatedAt: document.updatedAt, errorCode: "INTERNAL_ERROR" });
        log("comparison.orphan_document_recovered", undefined, document.id);
      }
      try {
        if (!extractionPort) throw new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "Extração real indisponível.", status: 503, retryable: false });
        const quote = await extractionPort.extract({ ownerId, comparisonId, documentId: document.id, requestId });
        const parsed = extractedQuoteSchema.safeParse(quote);
        if (!parsed.success) throw invalid();
        validateExtraction(parsed.data);
      } catch (error) {
        const safe = extractionError(error);
        // B normally persists failure itself. A guarded cleanup also handles a
        // port/transport failure after its processing write or failed cleanup.
        try {
          const current = (await documentRepository.listForComparison(comparisonId, ownerId)).find(d => d.id === document.id);
          if (current?.status === "processing") await documentRepository.markFailed({
            ownerId, comparisonId, documentId: document.id, updatedAt: current.updatedAt, errorCode: safe.code,
          });
        } catch { log("comparison.document_failure_persistence_failed", safe.code, document.id); }
        throw safe;
      }
    }
    // Persistence, not a returned provider value, is the completion authority.
    const persisted = await documentRepository.listForComparison(comparisonId, ownerId);
    assertCount(persisted.length);
    if (persisted.length !== documents.length || persisted.some(d => !documents.some(original => original.id === d.id))) throw conflict();
    const quotes = persisted.map(validatedDocument);
    let result: ComparisonResult;
    try { result = comparisonResultSchema.parse((input.engine ?? compareQuotes)(quotes)); }
    catch { throw new AppError({ code: "COMPARISON_ENGINE_ERROR", message: "Não foi possível produzir uma comparação válida.", status: 500, retryable: false }); }
    const completed = await comparisonRepository.completeProcessing({ ...attempt, result });
    log("comparison.completed");
    return completed;
  } catch (error) {
    const safe = error instanceof AppError ? error : new AppError({ code: "INTERNAL_ERROR", message: "Unexpected comparison processing error.", status: 500, retryable: false });
    try { await comparisonRepository.failProcessing({ ...attempt, errorCode: safe.code }); }
    catch { log("comparison.failure_persistence_failed", safe.code); }
    log("comparison.failed", safe.code);
    throw safe;
  }
}
