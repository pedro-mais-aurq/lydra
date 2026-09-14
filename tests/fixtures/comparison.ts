import type { ExtractedItem, ExtractedQuote } from "@/contracts";
import { fixture } from "./extraction/helpers";

export const ids = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
] as const;
export const canonicalQuotes = () => [
  { documentId: ids[0], quote: fixture("additional-known").expected },
  { documentId: ids[1], quote: fixture("included").expected },
  { documentId: ids[2], quote: fixture("shipping-absent").expected },
];
export const quote = (overrides: Partial<ExtractedQuote> = {}): ExtractedQuote => ({ ...fixture().expected, ...overrides });
export const item = (rawDescription: string, unit: string | null = "un"): ExtractedItem => ({
  rawDescription, unit, quantity: null, unitPrice: null, totalPrice: null,
  evidence: { page: 1, text: rawDescription },
});
