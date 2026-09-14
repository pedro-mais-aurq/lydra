import "server-only";
import type { ExtractedQuote } from "@/contracts";

/** Local serialization convention; does not add a global enum or DTO. */
export function expectedMissingFields(quote: ExtractedQuote): string[] {
  const missing: string[] = [];
  for (const key of ["supplierName", "displayedTotal", "paymentTerms", "deliveryDays", "warranty"] as const) {
    if (quote[key] === null) missing.push(key);
  }
  if (quote.currency === "UNKNOWN") missing.push("currency");
  if (quote.shipping.status === "not_informed" || quote.shipping.status === "unclear") missing.push("shipping");
  if (quote.shipping.status === "additional" && quote.shipping.amount === null) missing.push("shipping.amount");
  for (const [index, item] of quote.items.entries()) {
    for (const key of ["quantity", "unit", "unitPrice", "totalPrice"] as const) {
      if (item[key] === null) missing.push("items[" + index + "]." + key);
    }
  }
  return missing;
}
