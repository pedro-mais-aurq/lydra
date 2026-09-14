import { compareQuotes } from "@/modules/comparison/engine";
import { serializeComparison, serializeQuoteDocument } from "@/core/domain/serializers";
import { canonicalQuotes } from "./comparison";
import { processHarness } from "./comparison-process";
import type { ComparisonDetail } from "@/modules/product/api";
export function completedDetail(): ComparisonDetail {
  const harness = processHarness(3);
  harness.documents.forEach((_, index) => harness.complete(index));
  harness.comparison.status = "completed";
  harness.comparison.result = compareQuotes(canonicalQuotes());
  return { ...serializeComparison(harness.comparison), documents: harness.documents.map(serializeQuoteDocument) };
}
