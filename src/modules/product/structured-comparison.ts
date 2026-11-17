import { z } from "zod";
import type { ExtractedQuote } from "@/contracts";
import { compareQuotes } from "@/modules/comparison/engine";
import fixture from "@/assets/propostas-de-exemplo.json";
import type { ComparisonDetail } from "./api";
import { parseAmount } from "./purchase-scenario";

type SampleDocument = (typeof fixture.documents)[number];
const samples = fixture.documents;

export const simulationOptions = samples.map(({ id, extractedData }) => ({
  id, name: extractedData.supplierName, total: extractedData.displayedTotal,
  shipping: extractedData.shipping,
}));

const selection = z.array(z.string().uuid()).min(2).max(4)
  .refine((ids) => new Set(ids).size === ids.length);

function displayResult(title: string, documents: ComparisonDetail["documents"]): ComparisonDetail {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const quotes = documents.flatMap((document) => (
    document.extractedData ? [{ documentId: document.id, quote: document.extractedData }] : []
  ));
  return {
    id, title, status: "completed", createdAt: now, updatedAt: now, errorCode: null,
    result: compareQuotes(quotes),
    documents: documents.map((document) => ({ ...document, comparisonId: id })),
  };
}

export function simulateComparison(input: unknown) {
  const ids = selection.safeParse(input);
  if (!ids.success) return null;
  const selected = samples.filter((document) => ids.data.includes(document.id));
  if (selected.length !== ids.data.length) return null;
  return displayResult("Propostas simuladas", selected.map((item: SampleDocument) => ({
    ...item, status: "completed", extractionSchemaVersion: 1,
    extractedData: item.extractedData as ExtractedQuote,
  })));
}

const money = z.string().max(24).transform(parseAmount).pipe(z.number().int().nonnegative());
const manualQuote = z.object({
  supplier: z.string().trim().min(1).max(90),
  amount: money,
  mode: z.enum(["unknown", "included", "extra"]),
  shipping: z.string().max(24),
  days: z.string().max(4).regex(/^\d{0,4}$/),
}).superRefine((value, ctx) => {
  if (value.mode === "extra" && parseAmount(value.shipping) === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shipping"], message: "Informe o frete adicional." });
  }
});
const manualInput = z.array(manualQuote).min(2).max(4);

export function compareManualValues(input: unknown) {
  const parsed = manualInput.safeParse(input);
  if (!parsed.success) return null;
  const now = new Date().toISOString();
  const documents = parsed.data.map((value, index): ComparisonDetail["documents"][number] => {
    const freight = value.mode === "extra" ? parseAmount(value.shipping) : null;
    const quote: ExtractedQuote = {
      schemaVersion: 1, supplierName: value.supplier, displayedTotal: value.amount / 100, currency: "BRL",
      shipping: {
        status: value.mode === "extra" ? "additional" : value.mode === "included" ? "included" : "not_informed",
        amount: freight === null ? null : freight / 100,
      },
      deliveryDays: value.days === "" ? null : Number(value.days),
      paymentTerms: null, warranty: null, items: [],
      observations: ["Dados informados manualmente."],
      missingFields: [
        ...(value.mode === "unknown" ? ["shipping"] : []),
        ...(value.days === "" ? ["deliveryDays"] : []),
        "paymentTerms", "warranty",
      ],
      evidence: {
        supplierName: null, displayedTotal: null, shipping: null,
        deliveryDays: null, paymentTerms: null, warranty: null,
      },
    };
    return {
      id: "00000000-0000-4000-8000-00000000000" + (index + 1),
      comparisonId: "", fileName: "Proposta informada manualmente", mimeType: "text/plain",
      sizeBytes: 0, status: "completed" as const, extractedData: quote, extractionSchemaVersion: 1,
      errorCode: null, createdAt: now, updatedAt: now,
    };
  });
  return displayResult("Propostas informadas manualmente", documents);
}
