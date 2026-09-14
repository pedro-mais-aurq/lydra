import { expect, it } from "vitest";
import { compareQuotes } from "@/modules/comparison/engine";
import { canonicalQuotes, item } from "../fixtures/comparison";

function permutations<T>(input: T[]): T[][] {
  if (!input.length) return [[]];
  return input.flatMap((head, index) => permutations(input.filter((_, i) => i !== index)).map(tail => [head, ...tail]));
}
it("is repeatable, does not mutate input, and preserves the full result for every input permutation", () => {
  const input = canonicalQuotes().map(e => ({ ...e, quote: { ...e.quote, items: [item("Lâmpada LED 9W"), item("duplicata"), item("duplicata")] } }));
  const snapshot = structuredClone(input);
  const expected = compareQuotes(input);
  expect(compareQuotes(input)).toEqual(expected);
  for (const permutation of permutations(input)) expect(compareQuotes(permutation)).toEqual(expected);
  expect(input).toEqual(snapshot);
});
it("never selects a tied proposal under any permutation", () => {
  const input = canonicalQuotes().map(e => ({ ...e, quote: canonicalQuotes()[0]!.quote }));
  for (const permutation of permutations(input)) {
    const result = compareQuotes(permutation);
    expect(result.highlights.lowestKnownCostDocumentId).toBeNull();
    expect(result).toEqual(compareQuotes(input));
  }
});
