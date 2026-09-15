import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretationDraftSchema, validateInterpretation } from "../../interpretation/interpretation";
import { assembleExtractedQuote } from "../../assembly/assemble-extracted-quote";
import { validateClassification } from "../../classification/classification";
import { extractMonetaryCandidates } from "../../monetary/candidates";
import { expectedMissingFields } from "../../validation/missing-fields";
import { draft, emptyDraft, emptySelection, evidence, fact, money, selection } from "../fixtures";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());
const rejects = (fn: () => unknown) => expect(fn).toThrow(expect.objectContaining({ code: "EXTRACTION_INVALID" }));

describe("B4.1 interpreter evidence contract", () => {
  it("preserves nonmonetary facts, observations and literal monetaryEvidence", () => {
    const input = draft();
    expect(validateInterpretation(input)).toEqual(input);
    expect(validateInterpretation(emptyDraft())).toEqual(emptyDraft());
  });

  it.each(["supplierName", "paymentTerms", "deliveryDays", "warranty"] as const)("requires evidence for nonnull %s", field => {
    const input = draft();
    rejects(() => validateInterpretation({ ...input, [field]: { ...input[field], evidence: null } }));
  });

  it.each(["", " \n\t", "Valor encontrado.", "Segundo a proposta.", "O documento informa esse valor."])("rejects placeholder monetary evidence %j", text => {
    rejects(() => validateInterpretation({ ...draft(), monetaryEvidence: [money(text)] }));
  });

  it.each([0, -1, 1.5, Infinity, NaN])("rejects monetary evidence page %s before classification", page => {
    rejects(() => validateInterpretation({ ...draft(), monetaryEvidence: [{ evidence: evidence("R$ 4500", page), unmarkedTokens: [] }] }));
  });

  it("accepts zero and unknown page for delivery without inferring a lexical label", () => {
    const input = draft();
    input.deliveryDays = { value: 0, evidence: evidence("Disponibilidade imediata.", null) };
    const result = assembleExtractedQuote(input, extractMonetaryCandidates(input.monetaryEvidence), selection());
    expect(result.deliveryDays).toBe(0);
    expect(result.evidence.deliveryDays).toEqual(input.deliveryDays.evidence);
  });

  it.each(["additional", "included", "unclear", "not_applicable"] as const)("requires evidence for interpreted shipping %s", status => {
    rejects(() => validateInterpretation({ ...draft(), shipping: { status, evidence: null } }));
  });

  it("rejects observations absent from their literal evidence", () => {
    const input = { ...draft(), observations: [{ value: "Validade de 30 dias.", evidence: evidence("Validade de 15 dias.") }] };
    expect(interpretationDraftSchema.safeParse(input).success).toBe(true);
    rejects(() => validateInterpretation(input));
  });
});

describe("B4.1 exact candidate selection and missing fields", () => {
  it("parses the requested R$ 4500,50 syntax", () => {
    expect(extractMonetaryCandidates([money("Preço R$ 4500,50")])).toEqual([
      expect.objectContaining({ id: "money-0", value: 4500.5, raw: "R$ 4500,50", currency: "BRL" }),
    ]);
  });

  it("4500 and 200 do not synthesize a 4700 candidate", () => {
    expect(extractMonetaryCandidates([money("R$ 4.500"), money("R$ 200")]).map(candidate => candidate.value)).toEqual([4500, 200]);
  });

  it("equal amounts in distinct contexts keep separate money-0 and money-1 IDs", () => {
    const candidates = extractMonetaryCandidates([money("Opção A R$ 4.500"), money("Opção B R$ 4.500")]);
    expect(candidates.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "money-0", value: 4500 }, { id: "money-1", value: 4500 },
    ]);
    expect(candidates[0]!.evidence).not.toEqual(candidates[1]!.evidence);
  });

  it.each(["unitPriceCandidateId", "totalPriceCandidateId"] as const)("rejects unknown item reference %s", field => {
    rejects(() => validateClassification({ ...emptySelection, items: [
      { itemIndex: 0, unitPriceCandidateId: null, totalPriceCandidateId: null, [field]: "money-99" },
    ] }, [], 1));
  });

  it("maps out-of-order item selections by index and copies both printed prices without multiplying", () => {
    const input = emptyDraft();
    const texts = ["Item A: 2 un; unitário R$ 15; total R$ 29", "Item B: 3 un; unitário R$ 10; total R$ 28"];
    input.items = texts.map((text, index) => ({ rawDescription: index === 0 ? "Item A" : "Item B", quantity: index + 2, unit: "un", evidence: evidence(text) }));
    input.monetaryEvidence = texts.map(text => money(text));
    const candidates = extractMonetaryCandidates(input.monetaryEvidence);
    const result = assembleExtractedQuote(input, candidates, { ...emptySelection, items: [
      { itemIndex: 1, unitPriceCandidateId: "money-2", totalPriceCandidateId: "money-3" },
      { itemIndex: 0, unitPriceCandidateId: "money-0", totalPriceCandidateId: "money-1" },
    ] });
    expect(result.items).toEqual([
      { ...input.items[0], unitPrice: 15, totalPrice: 29 },
      { ...input.items[1], unitPrice: 10, totalPrice: 28 },
    ]);
    expect(result.displayedTotal).toBeNull();
    expect(result.missingFields).toEqual(expectedMissingFields(result));
    expect(result.missingFields).not.toContain("items[0].totalPrice");
  });

  it("recomputes missingFields while refusing an LLM-supplied list", () => {
    const input = emptyDraft();
    const result = assembleExtractedQuote(input, [], emptySelection);
    expect(result.missingFields).toEqual(expectedMissingFields(result));
    expect(result.missingFields).toContain("displayedTotal");
    rejects(() => validateInterpretation({ ...input, missingFields: [] }));
    rejects(() => validateClassification({ ...emptySelection, missingFields: [] }, [], 0));
  });

  it("does not infer BRL from a Brazilian supplier, city, CNPJ or Portuguese prose", () => {
    const input = emptyDraft();
    input.supplierName = fact("Fornecedor de Belo Horizonte — CNPJ 12.345.678/0001-90");
    input.monetaryEvidence = [money("Valor 4500", ["4500"])];
    const result = assembleExtractedQuote(input, extractMonetaryCandidates(input.monetaryEvidence), { ...emptySelection, displayedTotalCandidateId: "money-0" });
    expect(result).toMatchObject({ displayedTotal: 4500, currency: "UNKNOWN" });
    expect(result.missingFields).toContain("currency");
  });
});
