import { describe, expect, it } from "vitest";
import type { ShippingStatus } from "@/contracts";
import { assessCost } from "@/modules/comparison/cost-assessment";
import { canonicalQuotes, item, quote } from "../fixtures/comparison";

describe("cost assessment", () => {
  it("computes the three mandatory financial fixtures", () => {
    expect(canonicalQuotes().map(q => assessCost(q.quote))).toMatchObject([
      { displayedTotal: 4500, knownComparableTotal: 4700, completeness: "complete" },
      { displayedTotal: 4570, knownComparableTotal: 4570, completeness: "complete" },
      { displayedTotal: 4300, knownComparableTotal: 4300, completeness: "partial" },
    ]);
  });
  const cases: [ShippingStatus, number | null, number, string][] = [
    ["included", null, 4500, "complete"], ["included", 200, 4500, "complete"],
    ["not_applicable", null, 4500, "complete"], ["additional", 200, 4700, "complete"],
    ["additional", 0, 4500, "complete"], ["additional", null, 4500, "partial"],
    ["not_informed", null, 4500, "partial"], ["unclear", null, 4500, "partial"],
  ];
  it.each(cases)("%s with %s => %s (%s)", (status, amount, total, completeness) => {
    const result = assessCost(quote({ shipping: { status, amount } }));
    expect(result.knownComparableTotal).toBe(total);
    expect(result.completeness).toBe(completeness);
    if (completeness === "partial") expect(result.reasons.length).toBeGreaterThan(0);
  });
  it.each<ShippingStatus>(["included", "not_applicable", "additional", "not_informed", "unclear"])("null total stays unknown with %s and priced items", status => {
    const result = assessCost(quote({ displayedTotal: null, shipping: { status, amount: 200 }, items: [{ ...item("Produto"), totalPrice: 999 }] }));
    expect(result).toMatchObject({ displayedTotal: null, knownComparableTotal: null, completeness: "unknown" });
  });
  it("never replaces a displayed total with the item sum", () => {
    expect(assessCost(quote({ items: [{ ...item("Produto"), totalPrice: 10 }] })).knownComparableTotal).toBe(4700);
  });
  it("does not infer currency or change known components", () => {
    const source = quote({ currency: "UNKNOWN" });
    expect(assessCost(source).knownComparableTotal).toBe(4700);
    expect(source.currency).toBe("UNKNOWN");
  });
  it("retains explicit zero without defaulting absence", () => {
    expect(assessCost(quote({ displayedTotal: 0, shipping: { status: "not_informed", amount: null } }))).toMatchObject({ knownComparableTotal: 0, completeness: "partial" });
  });
  it("uses contract number arithmetic without silently rounding decimals", () => {
    expect(assessCost(quote({ displayedTotal: 10.1234, shipping: { status: "additional", amount: 0.2345 } })).knownComparableTotal).toBe(10.1234 + 0.2345);
  });
  it("rejects non-finite sums", () => {
    expect(() => assessCost(quote({ displayedTotal: Number.MAX_VALUE, shipping: { status: "additional", amount: Number.MAX_VALUE } }))).toThrow();
  });
});
