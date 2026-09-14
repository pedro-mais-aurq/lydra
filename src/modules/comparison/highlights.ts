import type { ComparisonResult, SupplierComparison } from "@/contracts";
import { lowestCostWarnings, MESSAGES } from "./warnings";

function uniqueMinimum(suppliers: readonly SupplierComparison[], value: (supplier: SupplierComparison) => number | null) {
  let minimum: number | null = null;
  let documentId: string | null = null;
  let count = 0;
  for (const supplier of suppliers) {
    const candidate = value(supplier);
    if (candidate === null) continue;
    if (minimum === null || candidate < minimum) {
      minimum = candidate; documentId = supplier.documentId; count = 1;
    } else if (candidate === minimum) count += 1;
  }
  return { documentId: count === 1 ? documentId : null, tied: count > 1 };
}

export function buildHighlights(suppliers: readonly SupplierComparison[], warnings: readonly string[]): ComparisonResult["highlights"] {
  const complete = uniqueMinimum(suppliers, s => s.currency === "BRL" && s.costAssessment.completeness === "complete" ? s.costAssessment.knownComparableTotal : null);
  const known = uniqueMinimum(suppliers, s => s.currency === "BRL" ? s.costAssessment.knownComparableTotal : null);
  const delivery = uniqueMinimum(suppliers, s => s.deliveryDays);
  return {
    lowestCompleteKnownCostDocumentId: complete.documentId,
    lowestKnownCostDocumentId: known.documentId,
    fastestKnownDeliveryDocumentId: delivery.documentId,
    warnings: [
      ...warnings, ...lowestCostWarnings(suppliers, known.documentId),
      ...(complete.tied ? [MESSAGES.completeTie] : []),
      ...(known.tied ? [MESSAGES.knownTie] : []),
      ...(delivery.tied ? [MESSAGES.deliveryTie] : []),
    ],
  };
}
