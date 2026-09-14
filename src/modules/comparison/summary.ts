import type { ComparisonResult, SupplierComparison } from "@/contracts";

export function buildSummary(suppliers: readonly SupplierComparison[], highlights: ComparisonResult["highlights"]): string {
  const complete = suppliers.find(s => s.documentId === highlights.lowestCompleteKnownCostDocumentId);
  const known = suppliers.find(s => s.documentId === highlights.lowestKnownCostDocumentId);
  const fastest = suppliers.find(s => s.documentId === highlights.fastestKnownDeliveryDocumentId);
  const parts = [
    complete ? `Menor custo completo conhecido: documento ${complete.documentId}, ${complete.costAssessment.knownComparableTotal} BRL.` : "Não há destaque único de menor custo completo conhecido em BRL.",
    known ? `Menor custo conhecido${known.costAssessment.completeness === "partial" ? " parcial" : " completo"}: documento ${known.documentId}, ${known.costAssessment.knownComparableTotal} BRL.` : "Não há destaque único de menor custo conhecido em BRL.",
    fastest ? `Menor prazo conhecido: documento ${fastest.documentId}, ${fastest.deliveryDays} dias.` : "Não há destaque único de menor prazo conhecido.",
  ];
  if (highlights.warnings.length) parts.push(`Incertezas e ressalvas: ${highlights.warnings.join(" ")}`);
  return parts.join(" ");
}
