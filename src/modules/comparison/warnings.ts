import type { CostAssessment, ExtractedQuote, SupplierComparison } from "@/contracts";

/** Fixed messages: absence remains uncertainty, never a guessed financial value. */
export const MESSAGES = {
  unknownCost: "O total exibido não foi informado; o custo comparável é desconhecido.",
  additionalUnknown: "O frete é adicional, mas seu valor não foi informado; o custo conhecido é parcial.",
  shippingUnknown: "O frete não foi informado; o custo conhecido não garante o custo final.",
  shippingUnclear: "O frete é incerto; o custo conhecido não garante o custo final.",
  unknownCurrency: "A moeda é UNKNOWN; a proposta não participa dos destaques monetários.",
  unknownDelivery: "O prazo não foi informado; não significa entrega imediata.",
  partialLowest: "O menor custo conhecido é parcial e não garante o menor custo final.",
  noComplete: "Nenhum custo completo conhecido em BRL está disponível.",
  completeTie: "Há empate no menor custo completo conhecido; nenhum documento foi destacado nessa métrica.",
  knownTie: "Há empate no menor custo conhecido; nenhum documento foi destacado nessa métrica.",
  deliveryTie: "Há empate no menor prazo conhecido; nenhum documento foi destacado nessa métrica.",
} as const;

export function documentWarnings(documentId: string, quote: ExtractedQuote, cost: CostAssessment): string[] {
  const messages: string[] = [];
  if (cost.knownComparableTotal === null) messages.push(MESSAGES.unknownCost);
  if (quote.currency === "UNKNOWN") messages.push(MESSAGES.unknownCurrency);
  if (quote.shipping.status === "not_informed") messages.push(MESSAGES.shippingUnknown);
  if (quote.shipping.status === "unclear") messages.push(MESSAGES.shippingUnclear);
  if (quote.shipping.status === "additional" && quote.shipping.amount === null) messages.push(MESSAGES.additionalUnknown);
  if (quote.deliveryDays === null) messages.push(MESSAGES.unknownDelivery);
  return messages.map(message => `Documento ${documentId}: ${message}`);
}

export function lowestCostWarnings(suppliers: readonly SupplierComparison[], lowestId: string | null): string[] {
  const warnings: string[] = [];
  if (!suppliers.some(s => s.currency === "BRL" && s.costAssessment.completeness === "complete" && s.costAssessment.knownComparableTotal !== null)) {
    warnings.push(MESSAGES.noComplete);
  }
  if (suppliers.some(s => s.documentId === lowestId && s.costAssessment.completeness === "partial")) {
    warnings.push(MESSAGES.partialLowest);
  }
  return warnings;
}
