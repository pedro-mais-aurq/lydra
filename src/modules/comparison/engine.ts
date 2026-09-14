import { comparisonResultSchema, extractedQuoteSchema, type ComparisonResult } from "@/contracts";
import { AppError } from "@/core/errors/app-error";
import { assessCost } from "./cost-assessment";
import { buildHighlights } from "./highlights";
import { compareIds, normalizeItems, type QuoteInput } from "./normalize-items";
import { buildSummary } from "./summary";
import { documentWarnings } from "./warnings";

/** Pure and synchronous: no HTTP, persistence, environment, clock or AI. */
export function compareQuotes(input: readonly QuoteInput[]): ComparisonResult {
  try {
    if (input.length < 2 || input.length > 4) throw new Error("Invalid document count.");
    const quotes = input.map(({ documentId, quote }) => ({ documentId, quote: extractedQuoteSchema.parse(quote) }))
      .sort((a, b) => compareIds(a.documentId, b.documentId));
    const suppliers = quotes.map(({ documentId, quote }) => ({
      documentId, supplierName: quote.supplierName, costAssessment: assessCost(quote),
      deliveryDays: quote.deliveryDays, currency: quote.currency, missingFields: [...quote.missingFields],
    }));
    const warnings = quotes.flatMap(({ documentId, quote }) => documentWarnings(documentId, quote, assessCost(quote)));
    const highlights = buildHighlights(suppliers, warnings);
    return comparisonResultSchema.parse({ suppliers, normalizedItems: normalizeItems(quotes), highlights, summary: buildSummary(suppliers, highlights) });
  } catch {
    throw new AppError({ code: "COMPARISON_ENGINE_ERROR", message: "Não foi possível produzir uma comparação válida.", status: 500, retryable: false });
  }
}
