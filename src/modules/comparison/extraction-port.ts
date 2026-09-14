import type { ExtractedQuote } from "@/contracts";

/** Internal C dependency. Successful extraction is validated AND persisted by B. */
export interface QuoteExtractionPort {
  extract(input: { ownerId: string; comparisonId: string; documentId: string; requestId: string }): Promise<ExtractedQuote>;
}
