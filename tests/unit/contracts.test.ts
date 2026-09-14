import { describe, expect, it, expectTypeOf } from "vitest";
import { z } from "zod";
import { comparisonResultSchema, extractedQuoteSchema, normalizedItemSchema, type ComparisonResult, type ExtractedQuote } from "@/contracts";
import { comparisonResult, documentId, otherDocumentId, extractedItem, extractedQuote } from "../fixtures/contracts";
describe("canonical runtime contracts", () => {
  it("schema and shared types agree", () => {
    expectTypeOf<z.infer<typeof comparisonResultSchema>>().toEqualTypeOf<ComparisonResult>();
    expectTypeOf<z.infer<typeof extractedQuoteSchema>>().toEqualTypeOf<ExtractedQuote>();
  });
  it("valid result preserves null, UNKNOWN, missing information and warnings", () => {
    const result = comparisonResultSchema.parse(comparisonResult);
    expect(result).toEqual(comparisonResult);
    expect(result.suppliers[0]?.costAssessment.knownComparableTotal).toBeNull();
    expect(result.suppliers[0]?.currency).toBe("UNKNOWN");
    expect(result.highlights.warnings).toEqual(["Informação incompleta"]);
  });
  it("extraction remains numeric v1; not_informed is not included and missing is not zero", () => {
    expect(extractedQuoteSchema.parse(extractedQuote)).toEqual(extractedQuote);
    expect(extractedQuoteSchema.safeParse({ ...extractedQuote, schemaVersion: "1" }).success).toBe(false);
    const missing = { ...extractedQuote, displayedTotal: undefined };
    expect(extractedQuoteSchema.safeParse(missing).success).toBe(false);
    expect(extractedQuoteSchema.parse({ ...extractedQuote, displayedTotal: 0 }).displayedTotal).toBe(0);
  });
  it.each(["bestSupplierId", "winner", "recommendedSupplierId", "score"])("rejects forbidden extra field %s", field => {
    expect(comparisonResultSchema.safeParse({ ...comparisonResult, [field]: documentId }).success).toBe(false);
    expect(comparisonResultSchema.safeParse({ ...comparisonResult, suppliers: [{ ...comparisonResult.suppliers[0], [field]: documentId }] }).success).toBe(false);
  });
  it.each([{}, { ...comparisonResult, suppliers: [{}] }, { ...comparisonResult, summary: 3 }, { ...comparisonResult, highlights: { ...comparisonResult.highlights, fastestKnownDeliveryDocumentId: otherDocumentId } }])("rejects invalid shape or dangling reference", value => {
    expect(comparisonResultSchema.safeParse(value).success).toBe(false);
  });
  it("exact requires compatible explicit units; probable preserves uncertainty", () => {
    const entries = [{ documentId, itemIndex: 0, item: { ...extractedItem, unit: "kg" } }, { documentId: otherDocumentId, itemIndex: 0, item: { ...extractedItem, unit: "un" } }];
    expect(normalizedItemSchema.safeParse({ match: "exact", entries }).success).toBe(false);
    expect(normalizedItemSchema.parse({ match: "probable", entries }).match).toBe("probable");
    entries[1]!.item.unit = "kg";
    expect(normalizedItemSchema.safeParse({ match: "exact", entries }).success).toBe(true);
    expect(normalizedItemSchema.safeParse({ match: "exact", entries: entries.map(e => ({ ...e, item: extractedItem })) }).success).toBe(false);
  });
});
