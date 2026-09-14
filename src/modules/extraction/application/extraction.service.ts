import "server-only";
import type { ExtractedQuote } from "@/contracts";
import { logRequest } from "@/core/errors/logger";
import type { ExtractionProvider } from "../domain/extraction-provider";
import type { DocumentScope, ExtractionContext, ExtractionStore, ProcessingLease } from "../domain/extraction-store";
import { invalidExtraction, sanitizeProviderError, sanitizeStoreError, stateConflict } from "../domain/errors";
import { validateExtraction } from "../validation/extracted-quote.schema";
import { validateDocumentInput } from "../validation/document-input";
import { validateContext } from "../validation/scope";

export class ExtractionService {
  constructor(private readonly store: ExtractionStore, private readonly provider: ExtractionProvider | (() => ExtractionProvider)) { }

  async extract(input: ExtractionContext): Promise<ExtractedQuote> {
    const context = validateContext(input);
    const scope: DocumentScope = { ownerId: context.ownerId, comparisonId: context.comparisonId, documentId: context.documentId };
    const start = performance.now();
    let lease: ProcessingLease | undefined;
    let stage: "store" | "provider" | "validation" = "store";
    const log = (event: string, errorCode?: string) => logRequest({
      requestId: context.requestId, comparisonId: scope.comparisonId, documentId: scope.documentId,
      stage: event, ...(errorCode ? { errorCode } : {}), durationMs: Math.round(performance.now() - start),
    });
    try {
      const stored = await this.store.loadDocument(scope);
      if (stored.status === "completed") {
        stage = "validation";
        if (stored.extractionSchemaVersion !== 1) throw invalidExtraction();
        const quote = validateExtraction(stored.extractedData);
        log("extraction.reused");
        return quote;
      }
      if (stored.status !== "uploaded" && stored.status !== "failed") throw stateConflict();
      if (stored.extractedData !== null || stored.extractionSchemaVersion !== null) throw invalidExtraction();
      lease = await this.store.markProcessing(scope);
      log("extraction.processing");
      const document = await this.store.downloadDocument(scope);
      stage = "provider";
      validateDocumentInput(document);
      const provider = typeof this.provider === "function" ? this.provider() : this.provider;
      const response: unknown = await provider.extract(document);

      log("extraction.provider_completed");

      stage = "validation";
      const quote = validateExtraction(response);
      stage = "store";
      await this.store.saveCompletedExtraction(scope, lease, quote);
      log("extraction.completed");
      return quote;
    } catch (error) {
      const safe = stage === "provider" ? sanitizeProviderError(error) :
        stage === "validation" ? invalidExtraction() : sanitizeStoreError(error);
      if (lease) {
        try { await this.store.markFailed(scope, lease, safe.code); }
        catch { log("extraction.failure_persistence_failed", safe.code); }
      }
      log("extraction.failed", safe.code);
      throw safe;
    }
  }
}
