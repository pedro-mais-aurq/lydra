import { describe, expect, it } from "vitest";
import { comparisonResultSchema } from "@/contracts";
import { compareQuotes } from "@/modules/comparison/engine";
import { MESSAGES } from "@/modules/comparison/warnings";
import { canonicalQuotes, ids, quote } from "../fixtures/comparison";

describe("comparison engine and highlights", () => {
  it("highlights B complete, C known partial with warning, A fastest", () => {
    const result = compareQuotes(canonicalQuotes());
    expect(result.highlights).toMatchObject({ lowestCompleteKnownCostDocumentId: ids[1], lowestKnownCostDocumentId: ids[2], fastestKnownDeliveryDocumentId: ids[0] });
    expect(result.highlights.warnings).toContain(MESSAGES.partialLowest);
    expect(result.summary).toContain("Menor custo conhecido parcial");
    expect(comparisonResultSchema.safeParse(result).success).toBe(true);
  });
  it("excludes UNKNOWN from money metrics even with a lower complete cost", () => {
    const result = compareQuotes([
      { documentId: ids[0], quote: quote({ displayedTotal: 1, currency: "UNKNOWN", deliveryDays: 1 }) },
      { documentId: ids[1], quote: quote() },
    ]);
    expect(result.highlights).toMatchObject({ lowestCompleteKnownCostDocumentId: ids[1], lowestKnownCostDocumentId: ids[1], fastestKnownDeliveryDocumentId: ids[0] });
    expect(result.highlights.warnings.join(" ")).toContain(MESSAGES.unknownCurrency);
  });
  it("keeps every highlight null when all relevant values are unknown", () => {
    const input = ids.slice(0, 2).map(documentId => ({ documentId, quote: quote({ displayedTotal: null, deliveryDays: null, currency: "UNKNOWN" }) }));
    const { highlights, suppliers } = compareQuotes(input);
    expect(highlights).toMatchObject({ lowestCompleteKnownCostDocumentId: null, lowestKnownCostDocumentId: null, fastestKnownDeliveryDocumentId: null });
    expect(highlights.warnings).toContain(MESSAGES.noComplete);
    expect(suppliers.every(s => s.costAssessment.completeness === "unknown")).toBe(true);
  });
  it("has no complete highlight when only partial costs are available", () => {
    const result = compareQuotes(ids.slice(0, 2).map((documentId, i) => ({ documentId, quote: quote({ displayedTotal: 10 + i, shipping: { status: "not_informed", amount: null } }) })));
    expect(result.highlights.lowestCompleteKnownCostDocumentId).toBeNull();
    expect(result.highlights.lowestKnownCostDocumentId).toBe(ids[0]);
    expect(result.highlights.warnings).toContain(MESSAGES.noComplete);
  });
  it("returns null on all tied minima without arbitrary tie-breaking", () => {
    const result = compareQuotes(ids.slice(0, 2).map(documentId => ({ documentId, quote: quote() })));
    expect(result.highlights).toMatchObject({ lowestCompleteKnownCostDocumentId: null, lowestKnownCostDocumentId: null, fastestKnownDeliveryDocumentId: null });
    expect(result.highlights.warnings).toEqual(expect.arrayContaining([MESSAGES.completeTie, MESSAGES.knownTie, MESSAGES.deliveryTie]));
  });
  it("ties above the minimum do not cancel a unique minimum", () => {
    const input = ids.slice(0, 3).map((documentId, index) => ({ documentId, quote: quote({ displayedTotal: index === 0 ? 1 : 10, deliveryDays: index === 0 ? 0 : 2 }) }));
    const result = compareQuotes(input);
    expect(result.highlights.lowestKnownCostDocumentId).toBe(ids[0]);
    expect(result.highlights.fastestKnownDeliveryDocumentId).toBe(ids[0]);
  });
  it("does not convert null delivery to zero", () => {
    const result = compareQuotes([{ documentId: ids[0], quote: quote({ deliveryDays: null }) }, { documentId: ids[1], quote: quote({ deliveryDays: 4 }) }]);
    expect(result.highlights.fastestKnownDeliveryDocumentId).toBe(ids[1]);
  });
  it.each(["additional", "not_informed", "unclear"] as const)("warns about %s shipping", status => {
    const result = compareQuotes([{ documentId: ids[0], quote: quote({ shipping: { status, amount: null } }) }, { documentId: ids[1], quote: quote() }]);
    expect(result.highlights.warnings.some(w => w.includes(ids[0]) && w.includes("frete"))).toBe(true);
  });
  it("preserves missing fields and never introduces subjective recommendation keys", () => {
    const input = canonicalQuotes(); const result = compareQuotes(input);
    expect(result.suppliers[2]?.missingFields).toEqual(input[2]?.quote.missingFields);
    expect(Object.keys(result).sort()).toEqual(["highlights", "normalizedItems", "summary", "suppliers"]);
    expect(JSON.stringify(result)).not.toMatch(/bestSupplierId|winnerId|recommendedSupplierId|recommendationScore|recomendamos|melhor fornecedor|melhor escolha|vencedor/i);
  });
  it("rejects duplicate document IDs through the canonical result contract", () => {
    expect(() => compareQuotes([{ documentId: ids[0], quote: quote() }, { documentId: ids[0], quote: quote() }])).toThrow(expect.objectContaining({ code: "COMPARISON_ENGINE_ERROR" }));
  });
});
