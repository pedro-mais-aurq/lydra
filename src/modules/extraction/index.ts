import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ExtractionService } from "./application/extraction.service";
import { SupabaseExtractionStore } from "./infrastructure/supabase-extraction.store";
import { OpenAIExtractionProvider } from "./providers/openai.provider";
import { readExtractionConfig } from "./providers/config";

export { ExtractionService } from "./application/extraction.service";
export { validateExtraction } from "./validation/extracted-quote.schema";
export type { ExtractionProvider, ProviderExtractionInput } from "./domain/extraction-provider";
export type { DocumentScope, ExtractionContext, ExtractionStore, ProcessingLease, StoredExtraction } from "./domain/extraction-store";

/** C must authenticate, validate owner/comparison and acquire its aggregate lock first.
 * Lazy config/provider creation allows validated completed reuse without an AI key. */
export function createExtractionService(authorizedBackendClient: SupabaseClient): ExtractionService {
  return new ExtractionService(new SupabaseExtractionStore(authorizedBackendClient), () => new OpenAIExtractionProvider(readExtractionConfig()));
}
