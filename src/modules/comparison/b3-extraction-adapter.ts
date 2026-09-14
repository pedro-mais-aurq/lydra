import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { ExtractionService, type ExtractionStore } from "@/modules/extraction";
import { SupabaseExtractionStore } from "@/modules/extraction/infrastructure/supabase-extraction.store";
import { OpenAIExtractionProvider } from "@/modules/extraction/providers/openai.provider";
import { readExtractionConfig } from "@/modules/extraction/providers/config";
import type { QuoteExtractionPort } from "./extraction-port";

/** B.3's unchanged service owns per-document sequencing/semantics. All writes
 * in /process go through the official repository, retaining B.3's attempt token.
 * The existing B store supplies its hardened owner/path/size/Storage read checks. */
export function repositoryExtractionStore(
  repository: Pick<QuoteDocumentRepository, "markProcessing" | "completeExtraction" | "markFailed">,
  source: Pick<ExtractionStore, "loadDocument" | "downloadDocument">,
): ExtractionStore {
  return {
    loadDocument: scope => source.loadDocument(scope),
    downloadDocument: scope => source.downloadDocument(scope),
    markProcessing: async scope => ({ updatedAt: (await repository.markProcessing(scope)).updatedAt }),
    saveCompletedExtraction: async (scope, lease, extraction) => {
      await repository.completeExtraction({ ...scope, updatedAt: lease.updatedAt, extraction });
    },
    markFailed: (scope, lease, errorCode) => repository.markFailed({ ...scope, updatedAt: lease.updatedAt, errorCode }),
  };
}

export function createB3ExtractionPort(authorizedBackendClient: SupabaseClient, repository: QuoteDocumentRepository): QuoteExtractionPort {
  return new ExtractionService(
    repositoryExtractionStore(repository, new SupabaseExtractionStore(authorizedBackendClient)),
    () => new OpenAIExtractionProvider(readExtractionConfig()),
  );
}
