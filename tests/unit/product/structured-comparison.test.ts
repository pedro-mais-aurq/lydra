import { describe, expect, it } from "vitest";
import { compareManualValues, simulateComparison, simulationOptions } from "@/modules/product/structured-comparison";

describe("simulated comparison", () => {
  it("recalculates highlights from only the selected proposals", () => {
    const [a, b, c] = simulationOptions;
    expect(a && b && c).toBeTruthy();
    const ab = simulateComparison([a!.id, b!.id]);
    const ac = simulateComparison([a!.id, c!.id]);
    expect(ab?.result?.suppliers).toHaveLength(2);
    expect(ab?.result?.highlights.lowestCompleteKnownCostDocumentId).toBe(b!.id);
    expect(ac?.result?.highlights.lowestCompleteKnownCostDocumentId).toBe(a!.id);
    expect(ac?.result?.suppliers.find((item) => item.documentId === c!.id)?.costAssessment.completeness).toBe("partial");
  });

  it("rejects duplicate and non-fixture proposal IDs", () => {
    const demo = simulationOptions[0]!;
    expect(simulateComparison([demo.id, demo.id])).toBeNull();
    expect(simulateComparison([demo.id, "00000000-0000-4000-8000-000000000001"])).toBeNull();
  });
});

describe("comparison of manually entered real values", () => {
  const a = { supplier: "Fornecedor 1", amount: "4.500,00", mode: "extra", shipping: "200,00", days: "4" };
  const b = { supplier: "Fornecedor 2", amount: "4.300,00", mode: "unknown", shipping: "", days: "" };

  it("uses the original cost rules for entered values and marks unknown freight", () => {
    const result = compareManualValues([a, b]);
    expect(result?.result?.suppliers.map((item) => item.costAssessment.knownComparableTotal)).toEqual([4700, 4300]);
    expect(result?.result?.suppliers.map((item) => item.costAssessment.completeness)).toEqual(["complete", "partial"]);
    expect(result?.documents[1]?.extractedData?.evidence.displayedTotal).toBeNull();
  });

  it("rejects incomplete additional freight and invalid amounts", () => {
    expect(compareManualValues([{ ...a, shipping: "" }, b])).toBeNull();
    expect(compareManualValues([{ ...a, amount: "-10" }, b])).toBeNull();
  });
});
