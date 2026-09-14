import type { ExtractedQuote, NormalizedItem } from "@/contracts";

export type QuoteInput = { documentId: string; quote: ExtractedQuote };
export const PROBABLE_TOKEN_THRESHOLD = 0.9;
const GRAMMATICAL_TOKENS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos"]);
export const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function normalizeDescription(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

type Entry = NormalizedItem["entries"][number];
function compatible(a: Entry, b: Entry): boolean {
  if (a.documentId === b.documentId) return false;
  if (a.item.unit !== null && b.item.unit !== null && a.item.unit !== b.item.unit) return false;
  const left = normalizeDescription(a.item.rawDescription);
  const right = normalizeDescription(b.item.rawDescription);
  if (!left || !right) return false;
  if (left === right) return true;
  const x = new Set(left.split(" "));
  const y = new Set(right.split(" "));
  if (Math.min(x.size, y.size) < 3) return false;
  const union = new Set([...x, ...y]);
  const common = [...x].filter(token => y.has(token));
  if (common.length / union.size < PROBABLE_TOKEN_THRESHOLD) return false;
  // High overlap alone is unsafe: differing model numbers, colors, negation,
  // materials or dimensions stay unmatched. Only articles/prepositions may differ.
  return [...union].filter(token => !x.has(token) || !y.has(token)).every(token => GRAMMATICAL_TOKENS.has(token));
}

export function normalizeItems(input: readonly QuoteInput[]): NormalizedItem[] {
  const entries: Entry[] = [...input].sort((a, b) => compareIds(a.documentId, b.documentId))
    .flatMap(({ documentId, quote }) => quote.items.map((item, itemIndex) => ({ documentId, itemIndex, item })));
  const adjacency = entries.map(() => new Set<number>());
  entries.forEach((entry, i) => entries.forEach((other, j) => {
    if (j > i && compatible(entry, other)) { adjacency[i]?.add(j); adjacency[j]?.add(i); }
  }));
  const visited = new Set<number>();
  const groups: NormalizedItem[] = [];
  entries.forEach((_, start) => {
    if (visited.has(start)) return;
    const pending = [start];
    const component: number[] = [];
    while (pending.length) {
      const index = pending.pop();
      if (index === undefined || visited.has(index)) continue;
      visited.add(index); component.push(index);
      for (const adjacent of adjacency[index] ?? []) if (!visited.has(adjacent)) pending.push(adjacent);
    }
    component.sort((a, b) => a - b);
    const members = component.flatMap(index => entries[index] ? [entries[index]] : []);
    // An unambiguous group must form a complete graph with one item per document.
    // Duplicate descriptions and non-transitive similarity are never paired greedily.
    const unambiguous = members.length > 1 && new Set(members.map(e => e.documentId)).size === members.length &&
      component.every(i => component.every(j => i === j || adjacency[i]?.has(j)));
    if (!unambiguous) {
      groups.push(...members.map(entry => ({ match: "unmatched" as const, entries: [entry] })));
      return;
    }
    const first = members[0];
    const exact = first !== undefined && first.item.unit !== null && first.item.unit.trim() !== "" &&
      members.every(e => e.item.unit === first.item.unit && normalizeDescription(e.item.rawDescription) === normalizeDescription(first.item.rawDescription));
    groups.push({ match: exact ? "exact" : "probable", entries: members });
  });
  return groups;
}
