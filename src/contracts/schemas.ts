import { z } from "zod";
import type { ComparisonResult, CostAssessment, EvidenceRef, ExtractedItem, ExtractedQuote, NormalizedItem, SupplierComparison } from "./index";

const nullableNumber = z.number().finite().nullable();
export const comparisonStatusSchema = z.enum(["draft", "processing", "completed", "failed"]);
export const documentStatusSchema = z.enum(["uploaded", "processing", "completed", "failed"]);
export const shippingStatusSchema = z.enum(["included", "additional", "not_informed", "not_applicable", "unclear"]);
export const evidenceRefSchema = z.object({ page: nullableNumber, text: z.string() }).strict() satisfies z.ZodType<EvidenceRef>;
export const extractedItemSchema = z.object({
  rawDescription: z.string(), quantity: nullableNumber, unit: z.string().nullable(),
  unitPrice: nullableNumber, totalPrice: nullableNumber, evidence: evidenceRefSchema,
}).strict() satisfies z.ZodType<ExtractedItem>;
export const extractedQuoteSchema = z.object({
  schemaVersion: z.literal(1), supplierName: z.string().nullable(), displayedTotal: nullableNumber,
  currency: z.enum(["BRL", "UNKNOWN"]),
  shipping: z.object({ status: shippingStatusSchema, amount: nullableNumber }).strict(),
  paymentTerms: z.string().nullable(), deliveryDays: nullableNumber, warranty: z.string().nullable(),
  items: z.array(extractedItemSchema), observations: z.array(z.string()), missingFields: z.array(z.string()),
  evidence: z.object({ supplierName: evidenceRefSchema.nullable(), displayedTotal: evidenceRefSchema.nullable(),
    shipping: evidenceRefSchema.nullable(), paymentTerms: evidenceRefSchema.nullable(),
    deliveryDays: evidenceRefSchema.nullable(), warranty: evidenceRefSchema.nullable() }).strict(),
}).strict() satisfies z.ZodType<ExtractedQuote>;
export const costAssessmentSchema = z.object({
  displayedTotal: nullableNumber, knownComparableTotal: nullableNumber,
  completeness: z.enum(["complete", "partial", "unknown"]), reasons: z.array(z.string()),
}).strict() satisfies z.ZodType<CostAssessment>;
export const supplierComparisonSchema = z.object({
  documentId: z.string().uuid(), supplierName: z.string().nullable(), costAssessment: costAssessmentSchema,
  deliveryDays: nullableNumber, currency: z.enum(["BRL", "UNKNOWN"]), missingFields: z.array(z.string()),
}).strict() satisfies z.ZodType<SupplierComparison>;
export const normalizedItemSchema = z.object({
  match: z.enum(["exact", "probable", "unmatched"]),
  entries: z.array(z.object({ documentId: z.string().uuid(), itemIndex: z.number().int().nonnegative(), item: extractedItemSchema }).strict()).min(1),
}).strict().superRefine((group, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (group.match === "unmatched" && group.entries.length !== 1) issue("Unmatched requires one entry.");
  if (group.match !== "unmatched" && group.entries.length < 2) issue("A match requires at least two entries.");
  if (new Set(group.entries.map(e => e.documentId)).size !== group.entries.length) issue("A group has at most one entry per document.");
  if (group.match === "exact") {
    const unit = group.entries[0]?.item.unit;
    if (!unit || group.entries.some(e => e.item.unit !== unit)) issue("Exact requires explicitly identical units.");
  }
}) satisfies z.ZodType<NormalizedItem>;
export const comparisonResultSchema = z.object({
  suppliers: z.array(supplierComparisonSchema), normalizedItems: z.array(normalizedItemSchema),
  highlights: z.object({
    lowestCompleteKnownCostDocumentId: z.string().uuid().nullable(), lowestKnownCostDocumentId: z.string().uuid().nullable(),
    fastestKnownDeliveryDocumentId: z.string().uuid().nullable(), warnings: z.array(z.string()),
  }).strict(), summary: z.string(),
}).strict().superRefine((result, ctx) => {
  const ids = new Set(result.suppliers.map(s => s.documentId));
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (ids.size !== result.suppliers.length) issue("Duplicate supplier document.");
  for (const id of [result.highlights.lowestCompleteKnownCostDocumentId, result.highlights.lowestKnownCostDocumentId, result.highlights.fastestKnownDeliveryDocumentId]) {
    if (id !== null && !ids.has(id)) issue("Highlight must reference a supplier document.");
  }
  const entries = new Set<string>();
  for (const group of result.normalizedItems) for (const entry of group.entries) {
    if (!ids.has(entry.documentId)) issue("Item must reference a supplier document.");
    const key = `${entry.documentId}:${entry.itemIndex}`;
    if (entries.has(key)) issue("Item occurs in more than one group.");
    entries.add(key);
  }
}) satisfies z.ZodType<ComparisonResult>;
