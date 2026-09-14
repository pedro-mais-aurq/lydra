import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { processComparison } from "@/modules/comparison/process";
import { compareQuotes } from "@/modules/comparison/engine";
import { ExtractionService } from "@/modules/extraction";
import { SupabaseExtractionStore } from "@/modules/extraction/infrastructure/supabase-extraction.store";
import { repositoryExtractionStore } from "@/modules/comparison/b3-extraction-adapter";
import { AppError } from "@/core/errors/app-error";
import { QUOTE_DOCUMENTS_BUCKET } from "@/core/storage/bucket";
import { backend, createAnonymousUserClient, createComparisonFixture, createDocumentFixture, documentInput, trackStoragePath } from "./helpers";
import { canonicalQuotes } from "../fixtures/comparison";
import { fixture, pdfInput } from "../fixtures/extraction/helpers";

// Uses the existing mandatory disposable Supabase gate. NO skip or mocked SQL/locks.
const comparisons = new ComparisonRepository(backend);
const documents = new QuoteDocumentRepository(backend);
async function setup(count = 2) {
  const { userId } = await createAnonymousUserClient();
  const comparison = await createComparisonFixture(userId, "C.1 real integration");
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(await createDocumentFixture(userId, comparison.id));
  return { comparison, userId, rows, scope: { id: comparison.id, ownerId: userId } };
}
describe("C.1 real PostgreSQL/Auth/repository integration", () => {
  it("grants one of two concurrent acquisitions on the same aggregate", async () => {
    const h = await setup();
    const claims = await Promise.all([comparisons.tryAcquireProcessing(h.scope), comparisons.tryAcquireProcessing(h.scope)]);
    expect(claims.filter(Boolean)).toHaveLength(1); expect(claims.filter(c => c === null)).toHaveLength(1);
  });
  it("coordinates a real concurrent upload insert with processing acquisition", async () => {
    const h = await setup(); const row = documentInput(h.userId, h.comparison.id);
    const [upload, claim] = await Promise.all([
      documents.create({ id: row.id, comparisonId: row.comparison_id, ownerId: row.owner_id, fileName: row.file_name, storagePath: row.storage_path, mimeType: row.mime_type, sizeBytes: row.size_bytes }).then(value => ({ value, error: null }), (error: unknown) => ({ value: null, error })),
      comparisons.tryAcquireProcessing(h.scope),
    ]);
    expect(claim?.status).toBe("processing");
    const stable = await documents.listForComparison(h.comparison.id, h.userId);
    if (upload.error) { expect(upload.error).toMatchObject({ code: "INVALID_COMPARISON_STATE" }); expect(stable).toHaveLength(2); }
    else { expect(stable).toHaveLength(3); expect(stable.some(d => d.id === row.id)).toBe(true); }
    const late = documentInput(h.userId, h.comparison.id);
    await expect(documents.create({ id: late.id, comparisonId: late.comparison_id, ownerId: late.owner_id, fileName: late.file_name, storagePath: late.storage_path, mimeType: late.mime_type, sizeBytes: late.size_bytes })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    // Rejected insert rolls back its touch of the parent; it must not invalidate the acquired token.
    if (!claim) throw new Error("No processing claim");
    await comparisons.failProcessing({ ...h.scope, updatedAt: claim.updatedAt, errorCode: "INTERNAL_ERROR" });
  });
  it("completes A+C with all three real persisted canonical extractions and no AI", async () => {
    const h = await setup(3); const quotes = canonicalQuotes();
    for (const [index, row] of h.rows.entries()) {
      const scope = { ownerId: h.userId, comparisonId: h.comparison.id, documentId: row.id };
      const lease = await documents.markProcessing(scope);
      await documents.completeExtraction({ ...scope, updatedAt: lease.updatedAt, extraction: quotes[index]?.quote });
    }
    const result = await processComparison({ ownerId: h.userId, comparisonId: h.comparison.id, requestId: randomUUID(), comparisonRepository: comparisons, documentRepository: documents });
    expect(result.status).toBe("completed");
    expect(result.result?.highlights).toMatchObject({ lowestCompleteKnownCostDocumentId: h.rows[1]?.id, lowestKnownCostDocumentId: h.rows[2]?.id, fastestKnownDeliveryDocumentId: h.rows[0]?.id });
    await expect(processComparison({ ownerId: h.userId, comparisonId: h.comparison.id, requestId: randomUUID(), comparisonRepository: comparisons, documentRepository: documents })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
  });
  it("rejects cross-owner reads/acquisition/document transitions using the actual service-role client", async () => {
    const h = await setup(); const other = await createAnonymousUserClient();
    const wrong = { id: h.comparison.id, ownerId: other.userId };
    expect(await comparisons.findByIdForOwner(wrong)).toBeNull(); expect(await comparisons.tryAcquireProcessing(wrong)).toBeNull();
    const first = h.rows[0]; if (!first) throw new Error("Missing fixture");
    await expect(documents.markProcessing({ ownerId: other.userId, comparisonId: h.comparison.id, documentId: first.id })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(processComparison({ ownerId: other.userId, comparisonId: h.comparison.id, requestId: randomUUID(), comparisonRepository: comparisons, documentRepository: documents })).rejects.toMatchObject({ code: "COMPARISON_NOT_FOUND", status: 404 });
  });
  it("fences real stale aggregate writes after a failed retry", async () => {
    const h = await setup(); const first = await comparisons.tryAcquireProcessing(h.scope); if (!first) throw new Error("No claim");
    await comparisons.failProcessing({ ...h.scope, updatedAt: first.updatedAt, errorCode: "EXTRACTION_PROVIDER_ERROR" });
    const next = await comparisons.tryAcquireProcessing(h.scope); if (!next) throw new Error("No retry claim");
    await expect(comparisons.failProcessing({ ...h.scope, updatedAt: first.updatedAt, errorCode: "INTERNAL_ERROR" })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(comparisons.completeProcessing({ ...h.scope, updatedAt: first.updatedAt, result: compareQuotes(canonicalQuotes()) })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect((await comparisons.findByIdForOwner(h.scope))?.status).toBe("processing");
  });
  it("runs real B.3 + private Storage + official repositories, then reuses the first completed extraction on retry", async () => {
    const { userId } = await createAnonymousUserClient(); const comparison = await createComparisonFixture(userId);
    const input = pdfInput(); const rows = [];
    for (let i = 0; i < 2; i++) {
      const row = documentInput(userId, comparison.id); trackStoragePath(row.storage_path);
      expect((await backend.storage.from(QUOTE_DOCUMENTS_BUCKET).upload(row.storage_path, input.bytes, { contentType: input.mimeType })).error).toBeNull();
      rows.push(await documents.create({ id: row.id, comparisonId: comparison.id, ownerId: userId, fileName: row.file_name, storagePath: row.storage_path, mimeType: input.mimeType, sizeBytes: input.bytes.length }));
    }
    const provider = { extract: vi.fn().mockResolvedValueOnce(fixture().expected).mockRejectedValueOnce(new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "Synthetic provider failure", status: 502, retryable: true })).mockResolvedValue(fixture().expected) };
    const extractionPort = new ExtractionService(repositoryExtractionStore(documents, new SupabaseExtractionStore(backend)), provider);
    const run = () => processComparison({ ownerId: userId, comparisonId: comparison.id, requestId: randomUUID(), comparisonRepository: comparisons, documentRepository: documents, extractionPort });
    await expect(run()).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR" });
    const failed = await documents.listForComparison(comparison.id, userId);
    expect(failed.map(d => d.status).sort()).toEqual(["completed", "failed"]);
    const reused = failed.find(d => d.status === "completed");
    await expect(run()).resolves.toMatchObject({ status: "completed" });
    const finished = await documents.listForComparison(comparison.id, userId);
    expect(finished.find(d => d.id === reused?.id)).toEqual(reused);
    expect(provider.extract).toHaveBeenCalledTimes(3);
  });
});
