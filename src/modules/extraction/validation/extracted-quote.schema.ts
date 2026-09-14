import "server-only";
import { extractedQuoteSchema, type ExtractedQuote } from "@/contracts";
import { invalidExtraction } from "../domain/errors";
import { validateExtractionSemantics } from "./validate-extraction-semantics";

/** A.2 already owns the strict shape. Reuse it without a parallel DTO/schema. */
export const extractionRuntimeSchema = extractedQuoteSchema;

export function validateExtraction(input: unknown): ExtractedQuote {
  const result = extractionRuntimeSchema.safeParse(input);
  if (!result.success) throw invalidExtraction();
  // Local resource limits, not financial rules or shared contract changes.
  if (result.data.items.length > 500 || result.data.observations.length > 100 ||
      result.data.missingFields.length > 2010) throw invalidExtraction();
  validateExtractionSemantics(result.data);
  return result.data;
}
