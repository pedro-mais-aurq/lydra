import { costAssessmentSchema, type CostAssessment, type ExtractedQuote } from "@/contracts";
import { MESSAGES } from "./warnings";

export function assessCost(quote: ExtractedQuote): CostAssessment {
  const { displayedTotal, shipping } = quote;
  if (displayedTotal === null) {
    return { displayedTotal: null, knownComparableTotal: null, completeness: "unknown", reasons: [MESSAGES.unknownCost] };
  }
  let knownComparableTotal = displayedTotal;
  let completeness: CostAssessment["completeness"] = "complete";
  const reasons: string[] = [];
  if (shipping.status === "additional") {
    if (shipping.amount !== null) knownComparableTotal = displayedTotal + shipping.amount;
    else { completeness = "partial"; reasons.push(MESSAGES.additionalUnknown); }
  } else if (shipping.status === "not_informed" || shipping.status === "unclear") {
    completeness = "partial";
    reasons.push(shipping.status === "not_informed" ? MESSAGES.shippingUnknown : MESSAGES.shippingUnclear);
  }
  // No item-price fallback, rounding, conversion or included-freight addition.
  return costAssessmentSchema.parse({ displayedTotal, knownComparableTotal, completeness, reasons });
}
