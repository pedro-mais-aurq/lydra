import { describe, expect, it } from "vitest";
import {
  calculatePurchaseScenario,
  scenarioInputFromQuote,
  type PurchaseScenarioInput,
} from "@/modules/product/purchase-scenario";

const input: PurchaseScenarioInput = {
  price: "R$ 4.500,00",
  freightMode: "extra",
  freight: "200,50",
  discount: "150.10",
  ceiling: "4.800",
};

describe("purchase scenario", () => {
  it("adds additional freight and subtracts the discount in cents", () => {
    expect(calculatePurchaseScenario(input)).toEqual({
      ok: true,
      scenario: { subtotal: 434990, total: 455040, remainingBudget: 24960 },
    });
  });

  it("treats unknown freight as an incomplete total", () => {
    expect(calculatePurchaseScenario({ ...input, freightMode: "unknown", ceiling: "4.000" })).toEqual({
      ok: true,
      scenario: { subtotal: 434990, total: null, remainingBudget: -34990 },
    });
  });

  it("does not add freight already included in the displayed amount", () => {
    expect(calculatePurchaseScenario({ ...input, freightMode: "included", discount: "", ceiling: "" })).toEqual({
      ok: true,
      scenario: { subtotal: 450000, total: 450000, remainingBudget: null },
    });
  });

  it("accepts explicit zero for freight and preserves a zero spending ceiling", () => {
    expect(calculatePurchaseScenario({ ...input, freight: "0,00", ceiling: "0" })).toEqual({
      ok: true,
      scenario: { subtotal: 434990, total: 434990, remainingBudget: -434990 },
    });
  });

  it("requires a value for additional freight and rejects excessive discounts", () => {
    expect(calculatePurchaseScenario({ ...input, freight: "", discount: "4.500,01" })).toEqual({
      ok: false,
      errors: { freight: expect.any(String), discount: expect.any(String) },
    });
  });

  it.each(["", "-1", "1e3", "2,001", "1.000.000.000.000,00"])("rejects %j as an input amount", (price) => {
    expect(calculatePurchaseScenario({ ...input, price })).toEqual({
      ok: false,
      errors: { price: expect.any(String) },
    });
  });

  it("only prefills supported cent-precise amounts", () => {
    expect(scenarioInputFromQuote(4500.07)).toBe("4.500,07");
    expect(scenarioInputFromQuote(0)).toBe("0,00");
    expect(scenarioInputFromQuote(null)).toBe("");
    expect(scenarioInputFromQuote(19.759)).toBe("");
  });
});
