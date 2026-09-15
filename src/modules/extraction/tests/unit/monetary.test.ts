import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { extractMonetaryCandidates, selectedCurrency } from "../../monetary/candidates";
import { parseMonetaryNumber } from "../../monetary/number";
import { money } from "../fixtures";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());

describe("literal monetary syntax", () => {
  it.each([
    ["R$ 4.500,00", 4500], ["R$4.500,00", 4500], ["BRL 4500", 4500], ["4.500,00 BRL", 4500],
    ["R$ 4 500,00", 4500], ["R$ 4500", 4500], ["R$ 4500,5", 4500.5], ["R$ 4\u00a0500,00", 4500],
    ["R$ 4\u202f500,00", 4500], ["R$ 0,00", 0], ["R$ -10,25", -10.25], ["R$ 4.500", 4500],
    ["R$ 4,500.00", 4500], ["BRL 4500.50", 4500.5],
  ])("parses %s objectively", (raw, value) => {
    const text = `Oferta: ${raw}.`;
    const result = extractMonetaryCandidates([money(text)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "money-0", raw, value, currency: "BRL", explicitCurrency: "BRL", sourceEvidenceIndex: 0 });
    expect(text.slice(result[0]!.start, result[0]!.end)).toBe(raw);
  });
  it.each(["USD 4,500.00", "US$4500", "€ 4.500,00", "4500 GBP", "$4500", "JPY 4500"])("foreign currency %s stays UNKNOWN", text => {
    expect(extractMonetaryCandidates([money(text)])[0]).toMatchObject({ value: 4500, currency: "UNKNOWN", explicitCurrency: "FOREIGN" });
  });
  it.each(["4500", "4.500,00", "200", "4500,5"])("unmarked token %s needs an explicit semantic transcription hint", raw => {
    expect(extractMonetaryCandidates([money(`Valor: ${raw}`)])).toEqual([]);
    expect(extractMonetaryCandidates([money(`Valor: ${raw}`, [raw])])[0]).toMatchObject({ raw, currency: "UNKNOWN", explicitCurrency: null });
  });
  it.each(["12.345.678/0001-90", "+55 (11) 99999-1234", "14/09/2026", "2026-09-14", "Quantidade: 2", "Prazo: 7 dias", "12,50%", "Proposta 4500", "CNPJ 12345678000190"])("does not turn %s into money", text => {
    expect(extractMonetaryCandidates([money(text)])).toEqual([]);
  });
  it("does not pick other numbers from a monetary excerpt", () => {
    const text = "Proposta 4500, data 14/09/2026, quantidade 2, prazo 7 dias, desconto 10%, serviço R$ 900,00";
    expect(extractMonetaryCandidates([money(text)]).map(candidate => candidate.value)).toEqual([900]);
  });
  it.each(["R$ 12.345.678/0001-90", "R$ 12/09/2026", "R$ 15%", "R$12‰", "SKU-R$ 200"])("rejects monetary-looking fragments of %s", text => {
    expect(extractMonetaryCandidates([money(text)])).toEqual([]);
  });
  it.each(["1.2.3", "4,50,00", "4500,5000", "1 23,00", "900719925474099100", "NaN", "Infinity"])("does not repair ambiguous/malformed number %s", raw => {
    expect(parseMonetaryNumber(raw)).toBeNull();
  });
  it("rejects invented unmarked tokens and percentages even when requested", () => {
    for (const entry of [money("Preço: 4500", ["4700"]), money("Taxa: 12%", ["12"]), money("R$ 10,00", ["10,00"]), money("4500", ["4500", "4500"])]) {
      expect(() => extractMonetaryCandidates([entry])).toThrow(expect.objectContaining({ code: "EXTRACTION_INVALID" }));
    }
  });
  it("assigns deterministic IDs to each occurrence, never deduplicates by value or calculates", () => {
    const entries = [money("Peça: R$ 4.500; entrega R$ 200"), money("Total: R$ 4.500")];
    const result = extractMonetaryCandidates(entries);
    expect(result).toEqual(extractMonetaryCandidates(entries));
    expect(result.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "money-0", value: 4500 }, { id: "money-1", value: 200 }, { id: "money-2", value: 4500 },
    ]);
    expect(result.some(candidate => candidate.value === 4700)).toBe(false);
  });
  it("currency reflects only the selected candidates", () => {
    const candidates = extractMonetaryCandidates([money("R$ 4500"), money("USD 200"), money("300", ["300"])]);
    expect(selectedCurrency([])).toBe("UNKNOWN");
    expect(selectedCurrency([candidates[2]!])).toBe("UNKNOWN");
    expect(selectedCurrency([candidates[0]!, candidates[2]!])).toBe("BRL");
    expect(selectedCurrency([candidates[0]!, candidates[1]!])).toBe("UNKNOWN");
  });
});
