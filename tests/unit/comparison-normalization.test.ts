import { describe, expect, it } from "vitest";
import { normalizedItemSchema } from "@/contracts";
import { normalizeItems, PROBABLE_TOKEN_THRESHOLD } from "@/modules/comparison/normalize-items";
import { ids, item, quote } from "../fixtures/comparison";

function pair(a: string, b: string, left: string | null = "un", right: string | null = "un") {
  return normalizeItems([{ documentId: ids[0], quote: quote({ items: [item(a, left)] }) }, { documentId: ids[1], quote: quote({ items: [item(b, right)] }) }]);
}
describe("conservative item normalization", () => {
  it("normalizes case, whitespace, diacritics and punctuation while preserving raw text", () => {
    const result = pair("  LÂMPADA—LED,  9W  ", "lampada led 9w");
    expect(result).toHaveLength(1); expect(result[0]?.match).toBe("exact");
    expect(result[0]?.entries[0]?.item.rawDescription).toBe("  LÂMPADA—LED,  9W  ");
  });
  it.each([[null, null], [null, "un"], ["", ""]])("missing/empty unit %s/%s never exact", (a, b) => {
    const groups = pair("Produto igual", "Produto igual", a, b);
    expect(groups.every(g => g.match !== "exact")).toBe(true);
  });
  it.each([["kg", "g"], ["m", "cm"], ["un", "cx"], ["un", "UN"]])("explicitly different units %s/%s never match", (a, b) => {
    expect(pair("Produto igual", "Produto igual", a, b).map(g => g.match)).toEqual(["unmatched", "unmatched"]);
  });
  it("allows probable token reordering with identical informative tokens", () => {
    expect(pair("parafuso aço zincado 10 mm", "parafuso zincado aço 10 mm")[0]?.match).toBe("probable");
    expect(PROBABLE_TOKEN_THRESHOLD).toBe(0.9);
  });
  it("allows only high overlap with a grammatical-token difference", () => {
    expect(pair("kit suporte metal branco universal modelo 10 parede reforçado", "kit de suporte metal branco universal modelo 10 parede reforçado")[0]?.match).toBe("probable");
  });
  it.each([
    ["parafuso aço", "parafuso zincado"],
    ["kit suporte metal branco universal modelo 10 parede reforçado", "kit suporte metal branco universal modelo 12 parede reforçado"],
    ["kit suporte metal branco universal modelo 10 parede reforçado", "kit suporte metal preto universal modelo 10 parede reforçado"],
    ["kit com suporte metal branco universal modelo 10 parede reforçado", "kit sem suporte metal branco universal modelo 10 parede reforçado"],
    ["", ""], ["!!!", "..."],
  ])("leaves ambiguous descriptions unmatched: %s", (a, b) => {
    expect(pair(a, b).every(g => g.match === "unmatched")).toBe(true);
  });
  it("does not pick arbitrary duplicates within one proposal", () => {
    const groups = normalizeItems([
      { documentId: ids[0], quote: quote({ items: [item("Cabo 2m"), item("Cabo 2m")] }) },
      { documentId: ids[1], quote: quote({ items: [item("Cabo 2m")] }) },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.every(g => g.match === "unmatched")).toBe(true);
    expect(new Set(groups.flatMap(g => g.entries.map(e => `${e.documentId}:${e.itemIndex}`))).size).toBe(3);
  });
  it("refuses transitive matches through an unknown unit", () => {
    const groups = normalizeItems(["kg", null, "g"].map((unit, index) => ({ documentId: ids[index] ?? ids[0], quote: quote({ items: [item("Produto igual", unit)] }) })));
    expect(groups.map(g => g.match)).toEqual(["unmatched", "unmatched", "unmatched"]);
  });
  it("groups four unambiguous sources without duplicate document/item references", () => {
    const groups = normalizeItems(ids.slice(0, 4).map(documentId => ({ documentId, quote: quote({ items: [item("Produto igual")] }) })));
    expect(groups).toHaveLength(1); expect(groups[0]?.entries).toHaveLength(4);
    groups.forEach(g => expect(normalizedItemSchema.safeParse(g).success).toBe(true));
  });
});
