import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { extractedQuoteSchema } from "@/contracts";
import { assessCost } from "@/modules/comparison/cost-assessment";
import { validateInterpretation } from "../../interpretation/interpretation";
import { extractMonetaryCandidates } from "../../monetary/candidates";
import { validateClassification, monetaryClassificationSchema, classifierContext } from "../../classification/classification";
import { classificationJsonSchema, interpretationJsonSchema, type JsonSchema } from "../../providers/json-schema";
import { assembleExtractedQuote } from "../../assembly/assemble-extracted-quote";
import { validateExtraction } from "../../validation/extracted-quote.schema";
import { draft, selection, emptyDraft, emptySelection, money, evidence, HOSTILE_CONTEXT } from "../fixtures";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());
const assemble = (d = draft(), s = selection()) => assembleExtractedQuote(d, extractMonetaryCandidates(d.monetaryEvidence), s);
const rejects = (fn: () => unknown) => expect(fn).toThrow(expect.objectContaining({ code: "EXTRACTION_INVALID" }));

function checkClosed(schema: JsonSchema): void {
  if (schema.type === "object") {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties ?? {}));
    Object.values(schema.properties ?? {}).forEach(checkClosed);
  }
  if (schema.items) checkClosed(schema.items);
  schema.anyOf?.forEach(checkClosed);
}

describe("two strict internal schemas", () => {
  it("the interpreter has no canonical monetary values or missingFields", () => {
    const schema = interpretationJsonSchema(); checkClosed(schema);
    for (const key of ["displayedTotal", "currency", "missingFields"]) {
      expect(schema.properties).not.toHaveProperty(key);
      rejects(() => validateInterpretation({ ...draft(), [key]: 4500 }));
    }
    rejects(() => validateInterpretation({ ...draft(), shipping: { ...draft().shipping, amount: 200 } }));
  });
  it.each([null, "{}", { displayedTotal: 4700 }, { ...selection(), displayedTotalCandidateId: 4700 },
    { ...selection(), confidence: 1 }, { ...selection(), items: [{ itemIndex: 0, unitPrice: 4, unitPriceCandidateId: null, totalPriceCandidateId: null }] },
  ])("rejects malformed classification and extra monetary fields", input => {
    expect(monetaryClassificationSchema.safeParse(input).success).toBe(false);
  });
  it("strict wire schema allows only existing IDs or null", () => {
    const schema = classificationJsonSchema(["money-0", "money-1", "money-2"]); checkClosed(schema);
    expect(schema.properties?.displayedTotalCandidateId).toEqual({ anyOf: [{ type: "string", enum: ["money-0", "money-1", "money-2"] }, { type: "null" }] });
    expect(classificationJsonSchema([]).properties?.displayedTotalCandidateId).toEqual({ type: "null" });
  });
  it("accepts money-2 and rejects money-99 with no fallback", () => {
    const candidates = extractMonetaryCandidates([money("R$ 4500; R$ 200; R$ 4700")]);
    expect(validateClassification({ ...emptySelection, displayedTotalCandidateId: "money-2" }, candidates, 0).displayedTotalCandidateId).toBe("money-2");
    rejects(() => validateClassification({ ...emptySelection, displayedTotalCandidateId: "money-99" }, candidates, 0));
  });
  it.each([-1, 1, 0.5, Infinity, NaN])("rejects invalid item index %s", itemIndex => {
    rejects(() => validateClassification({ ...emptySelection, items: [{ itemIndex, unitPriceCandidateId: null, totalPriceCandidateId: null }] }, [], 1));
  });
  it("rejects duplicate/omitted items and duplicate assignment of an occurrence", () => {
    const item = { itemIndex: 0, unitPriceCandidateId: null, totalPriceCandidateId: null };
    rejects(() => validateClassification({ ...emptySelection, items: [item, item] }, [], 2));
    rejects(() => validateClassification(emptySelection, [], 1));
    rejects(() => validateClassification({ ...selection(), shippingAmountCandidateId: "money-0" }, extractMonetaryCandidates(draft().monetaryEvidence), 0));
  });
  it.each(["displayedTotalCandidateId", "shippingAmountCandidateId"] as const)("rejects unknown reference in %s", key => {
    rejects(() => validateClassification({ ...selection(), [key]: "money-99" }, extractMonetaryCandidates(draft().monetaryEvidence), 0));
  });
});

describe("deterministic assembly and frozen C", () => {
  it("A: 4500 + additional documented 200 remains 4700 complete in C", () => {
    const quote = assemble();
    expect(extractedQuoteSchema.safeParse(quote).success).toBe(true);
    expect(quote).toMatchObject({ displayedTotal: 4500, shipping: { status: "additional", amount: 200 }, currency: "BRL", deliveryDays: 4, missingFields: [] });
    expect(assessCost(quote)).toMatchObject({ knownComparableTotal: 4700, completeness: "complete" });
  });
  it("B: 4570 with included shipping remains 4570 complete without inventing zero", () => {
    const d = draft(); d.shipping = { status: "included", evidence: evidence("O transporte ficará por conta da contratada.") };
    d.monetaryEvidence = [money("Pela contratação, R$ 4570")];
    const quote = assemble(d, { ...emptySelection, displayedTotalCandidateId: "money-0" });
    expect(quote.shipping.amount).toBeNull();
    expect(assessCost(quote)).toMatchObject({ knownComparableTotal: 4570, completeness: "complete" });
  });
  it("C: 4300 without shipping remains 4300 partial", () => {
    const d = draft(); d.shipping = { status: "not_informed", evidence: null }; d.monetaryEvidence = [money("Montante R$ 4300")];
    const quote = assemble(d, { ...emptySelection, displayedTotalCandidateId: "money-0" });
    expect(quote.missingFields).toEqual(["shipping"]);
    expect(assessCost(quote)).toMatchObject({ knownComparableTotal: 4300, completeness: "partial" });
  });
  it("maintenance: extracts three printed occurrences and uses the classifier's selected total", () => {
    const text = "O serviço possui valor de R$ 4.500,00, acrescido de R$ 200,00 de deslocamento, totalizando R$ 4.700,00.";
    const d = draft(); d.monetaryEvidence = [money(text)]; d.shipping = { status: "included", evidence: evidence(text) };
    const candidates = extractMonetaryCandidates(d.monetaryEvidence);
    expect(candidates.map(candidate => candidate.value)).toEqual([4500, 200, 4700]);
    const quote = assembleExtractedQuote(d, candidates, { ...selection(), displayedTotalCandidateId: "money-2" });
    expect(quote.displayedTotal).toBe(4700);
    expect(assessCost(quote)).toMatchObject({ knownComparableTotal: 4700, completeness: "complete" });
  });
  it("does not synthesize an absent total or fill null price references", () => {
    const quote = assemble(draft(), { ...selection(), displayedTotalCandidateId: null });
    expect(quote.displayedTotal).toBeNull();
    expect(quote.evidence.displayedTotal).toBeNull();
    expect(quote.missingFields).toEqual(["displayedTotal"]);
    expect(assessCost(quote).knownComparableTotal).toBeNull();
  });
  it("additional with no selected shipping price stays null and missing", () => {
    const quote = assemble(draft(), { ...selection(), shippingAmountCandidateId: null });
    expect(quote.shipping.amount).toBeNull(); expect(quote.missingFields).toEqual(["shipping.amount"]);
    expect(assessCost(quote).completeness).toBe("partial");
  });
  it("preserves every absent field and derives missingFields in stable order", () => {
    expect(assemble(emptyDraft(), emptySelection)).toMatchObject({ supplierName: null, displayedTotal: null, currency: "UNKNOWN", paymentTerms: null, deliveryDays: null, warranty: null,
      shipping: { status: "not_informed", amount: null }, items: [], observations: [],
      missingFields: ["supplierName", "displayedTotal", "paymentTerms", "deliveryDays", "warranty", "currency", "shipping"] });
  });
  it.each(["unclear", "not_applicable", "not_informed"] as const)("rejects an amount selection for %s", status => {
    const d = draft(); d.shipping = { status, evidence: status === "not_informed" ? null : evidence("Condição comercial documentada.") };
    rejects(() => assemble(d));
  });
  it("permits included zero only when a selected real occurrence documents it", () => {
    const d = draft(); d.shipping = { status: "included", evidence: evidence("Transporte incluso: R$ 0,00") };
    d.monetaryEvidence[1] = money(d.shipping.evidence!.text);
    expect(assemble(d).shipping).toEqual({ status: "included", amount: 0 });
    expect(assemble(d, { ...selection(), shippingAmountCandidateId: null }).shipping.amount).toBeNull();
  });
  it("unmarked amounts cannot infer BRL from Portuguese or other unselected values", () => {
    const d = draft(); d.monetaryEvidence = [money("Total: 4.500,00", ["4.500,00"]), money("Outra opção R$ 4000")];
    const quote = assemble(d, { ...emptySelection, displayedTotalCandidateId: "money-0" });
    expect(quote.currency).toBe("UNKNOWN"); expect(quote.missingFields).toContain("currency");
  });
  it("mixed selected BRL/USD is UNKNOWN without conversion", () => {
    const d = draft(); d.shipping.evidence = evidence("Frete adicional: USD 200"); d.monetaryEvidence[1] = money(d.shipping.evidence.text);
    expect(assemble(d)).toMatchObject({ displayedTotal: 4500, currency: "UNKNOWN", shipping: { amount: 200 } });
  });
  it("does not infer currency from an unselected monetary candidate", () => {
    expect(assemble(draft(), emptySelection).currency).toBe("UNKNOWN");
  });
  it("uses existing item occurrences, keeps nulls and never multiplies quantity", () => {
    const d = emptyDraft(); const text = "Item A: 2 un; unitário R$ 15,00; total R$ 30,00";
    d.items = [{ rawDescription: "Item A", quantity: 2, unit: "un", evidence: evidence(text) }]; d.monetaryEvidence = [money(text)];
    const quote = assemble(d, { ...emptySelection, items: [{ itemIndex: 0, unitPriceCandidateId: "money-0", totalPriceCandidateId: null }] });
    expect(quote.items[0]).toMatchObject({ quantity: 2, unitPrice: 15, totalPrice: null });
    expect(quote.missingFields).toContain("items[0].totalPrice");
  });
  it("does not apply monetary cent precision restrictions to item quantities", () => {
    const d = emptyDraft();
    d.items = [{ rawDescription: "Material", quantity: 1.2345, unit: "kg", evidence: evidence("Material: 1,2345 kg") }];
    const quote = assemble(d, { ...emptySelection, items: [{ itemIndex: 0, unitPriceCandidateId: null, totalPriceCandidateId: null }] });
    expect(quote.items[0]?.quantity).toBe(1.2345);
  });
  it("rejects candidate mutations, invented offsets and duplicate IDs", () => {
    const d = draft(); const candidates = extractMonetaryCandidates(d.monetaryEvidence);
    for (const patch of [{ value: 4700 }, { currency: "UNKNOWN" as const }, { raw: "R$ 4700" }, { start: 99 }, { id: "money-99" }, { id: "money-1" }]) {
      rejects(() => assembleExtractedQuote(d, [{ ...candidates[0]!, ...patch }, candidates[1]!], selection()));
    }
  });
  it("never stitches evidence across pages or unrelated excerpts", () => {
    const d = draft(); d.shipping.evidence = evidence("A logística será paga à parte.", 2);
    rejects(() => assemble(d));
  });
});

describe("factual validation instead of commercial-language regex", () => {
  it("trusts semantic interpretation of a written delivery duration and unusual shipping wording", () => {
    const d = draft(); d.deliveryDays = { value: 7, evidence: evidence("Você receberá os bens após sete dias.") };
    d.shipping = { status: "included", evidence: evidence("A contratada arcará com toda a logística.") };
    expect(assemble(d, { ...selection(), shippingAmountCandidateId: null }).deliveryDays).toBe(7);
  });
  it.each([-1, 1.5, Infinity, NaN])("rejects invalid deliveryDays %s", value => {
    const d = draft(); d.deliveryDays!.value = value; rejects(() => assemble(d));
  });
  it("rejects missing, blank, invented text, malicious evidence, and nonliteral observations", () => {
    rejects(() => validateInterpretation({ ...draft(), supplierName: { value: "Supplier", evidence: null } }));
    rejects(() => validateInterpretation({ ...draft(), supplierName: { value: "Supplier", evidence: evidence(" ") } }));
    rejects(() => validateInterpretation({ ...draft(), supplierName: { value: "Supplier", evidence: evidence("Outro") } }));
    rejects(() => validateInterpretation({ ...draft(), monetaryEvidence: [money(HOSTILE_CONTEXT)] }));
    rejects(() => validateInterpretation({ ...draft(), observations: [{ value: "Recomendo este fornecedor.", evidence: evidence("Recomendo este fornecedor.") }] }));
  });
  it("rejects tampered persisted monetary facts, unsupported currency and wrong missing fields", () => {
    const quote = assemble();
    rejects(() => validateExtraction({ ...quote, displayedTotal: 4700 }));
    rejects(() => validateExtraction({ ...quote, missingFields: ["currency"] }));
    const d = emptyDraft(); d.monetaryEvidence = [money("Valor 4500", ["4500"])];
    const unknown = assemble(d, { ...emptySelection, displayedTotalCandidateId: "money-0" });
    rejects(() => validateExtraction({ ...unknown, currency: "BRL", missingFields: unknown.missingFields.filter(key => key !== "currency") }));
  });
  it("classifier gets only the semantic context needed for money, within an explicit size bound", () => {
    const d = draft(); const context = classifierContext(d, extractMonetaryCandidates(d.monetaryEvidence));
    expect(context).toContain("money-0"); expect(context).not.toContain("Fornecedor A"); expect(context).not.toContain("Proposta válida");
    expect(Buffer.byteLength(context)).toBeLessThan(64000);
  });
});
