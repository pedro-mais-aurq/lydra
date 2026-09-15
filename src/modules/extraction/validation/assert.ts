import "server-only";
import { invalidExtraction } from "../domain/errors";

/** Callers pass static internal codes, never document/provider strings. */
export function assertExtraction(condition: unknown, reason: string): asserts condition {
  if (condition) return;
  console.error("[lydra:extraction-validation]", { reason, errorCode: "EXTRACTION_INVALID" });
  throw invalidExtraction();
}
