import type { ComparisonResult, ExtractedItem, ExtractedQuote } from "@/contracts";
export const documentId = "20000000-0000-4000-8000-000000000001";
export const otherDocumentId = "20000000-0000-4000-8000-000000000002";
export const extractedItem: ExtractedItem = { rawDescription: "Item", quantity: null, unit: null, unitPrice: null, totalPrice: null, evidence: { page: null, text: "Item" } };
export const extractedQuote: ExtractedQuote = {
  schemaVersion: 1, supplierName: null, displayedTotal: null, currency: "UNKNOWN",
  shipping: { status: "not_informed", amount: null }, paymentTerms: null, deliveryDays: null, warranty: null,
  items: [extractedItem], observations: [], missingFields: ["displayedTotal", "shipping"],
  evidence: { supplierName: null, displayedTotal: null, shipping: null, paymentTerms: null, deliveryDays: null, warranty: null },
};
export const comparisonResult: ComparisonResult = {
  suppliers: [{ documentId, supplierName: null, costAssessment: { displayedTotal: null, knownComparableTotal: null, completeness: "unknown", reasons: ["Total não informado"] }, deliveryDays: null, currency: "UNKNOWN", missingFields: ["displayedTotal"] }],
  normalizedItems: [{ match: "unmatched", entries: [{ documentId, itemIndex: 0, item: extractedItem }] }],
  highlights: { lowestCompleteKnownCostDocumentId: null, lowestKnownCostDocumentId: null, fastestKnownDeliveryDocumentId: null, warnings: ["Informação incompleta"] }, summary: "Dados incompletos.",
};
