import { readFileSync } from "node:fs";
import { z } from "zod";
import { extractedQuoteSchema } from "@/contracts";
import { vi } from "vitest";
import type { ExtractionStore } from "@/modules/extraction";

const caseSchema = z.object({ document: z.string(), transcript: z.string(), expected: extractedQuoteSchema }).strict();
const raw: unknown = JSON.parse(readFileSync(new URL("cases.json", import.meta.url), "utf8"));
export const extractionCases = z.record(caseSchema).parse(raw);
const rawInvalid: unknown = JSON.parse(readFileSync(new URL("invalid-responses.json", import.meta.url), "utf8"));
export const invalidResponses = z.record(z.unknown()).parse(rawInvalid);

export function fixture(name = "additional-known") {
  const value = extractionCases[name];
  if (!value) throw new Error("Unknown synthetic fixture.");
  return structuredClone(value);
}

export function pdfInput(name = "additional-known") {
  const entry = fixture(name);
  return { mimeType: "application/pdf", bytes: new Uint8Array(readFileSync(new URL(entry.document, import.meta.url))) };
}

export const context = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  comparisonId: "22222222-2222-4222-8222-222222222222",
  documentId: "33333333-3333-4333-8333-333333333333",
  requestId: "44444444-4444-4444-8444-444444444444",
};
export const scope = { ownerId: context.ownerId, comparisonId: context.comparisonId, documentId: context.documentId };
export const lease = { updatedAt: "2026-09-12T12:00:00.000001+00:00" };

export function mockStore() {
  return {
    loadDocument: vi.fn<ExtractionStore["loadDocument"]>().mockResolvedValue({ status: "uploaded", extractedData: null, extractionSchemaVersion: null }),
    markProcessing: vi.fn<ExtractionStore["markProcessing"]>().mockResolvedValue(lease),
    downloadDocument: vi.fn<ExtractionStore["downloadDocument"]>().mockResolvedValue(pdfInput()),
    saveCompletedExtraction: vi.fn<ExtractionStore["saveCompletedExtraction"]>().mockResolvedValue(undefined),
    markFailed: vi.fn<ExtractionStore["markFailed"]>().mockResolvedValue(undefined),
  } satisfies ExtractionStore;
}

export function openaiResponse(value: unknown = fixture().expected) {
  return {
    status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
  };
}
