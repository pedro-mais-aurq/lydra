import { extractedQuote } from "../fixtures/contracts";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { backend, createAnonymousUserClient, createComparisonFixture, createDocumentFixture, documentInput } from "./helpers";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";

describe("repositories with real privileged backend and explicit owner scope", () => {
  it("creates draft/null and returns no other-owner or nonexistent aggregate", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const repo = new ComparisonRepository(backend);
    const ca = await repo.create({ ownerId: a.userId, title: "A" });
    expect(ca.status).toBe("draft"); expect(ca.result).toBeNull(); expect(ca.ownerId).toBe(a.userId);
    expect(await repo.findByIdForOwner({ id: ca.id, ownerId: b.userId })).toBeNull();
    expect(await repo.findByIdForOwner({ id: randomUUID(), ownerId: a.userId })).toBeNull();
    expect(await repo.listByOwner(b.userId)).toEqual([]);
  });
  it("creates one uploaded document with null extraction without requiring minimum 2", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const ca = await createComparisonFixture(a.userId);
    const repo = new QuoteDocumentRepository(backend);
    const input = documentInput(a.userId, ca.id);
    const doc = await repo.create({ id: input.id, comparisonId: ca.id, ownerId: a.userId, fileName: input.file_name, storagePath: input.storage_path, mimeType: input.mime_type, sizeBytes: input.size_bytes });
    expect(doc.status).toBe("uploaded"); expect(doc.extractedData).toBeNull(); expect(doc.extractionSchemaVersion).toBeNull();
    expect(await repo.countForComparison(ca.id, a.userId)).toBe(1);
    expect(await repo.listForComparison(ca.id, b.userId)).toEqual([]);
    expect(await repo.countForComparison(ca.id, b.userId)).toBe(0);
    expect((await new ComparisonRepository(backend).findByIdForOwner({ id: ca.id, ownerId: a.userId }))?.status).toBe("draft");
  });
  it("serializes eight simultaneous inserts starting from count=3: exactly one succeeds", async () => {
    const a = await createAnonymousUserClient(); const ca = await createComparisonFixture(a.userId);
    for (let i = 0; i < 3; i++) await createDocumentFixture(a.userId, ca.id);
    const repo = new QuoteDocumentRepository(backend);
    const results = await Promise.allSettled(Array.from({ length: 8 }, async () => {
      const d = documentInput(a.userId, ca.id);
      return repo.create({ id: d.id, comparisonId: ca.id, ownerId: a.userId, fileName: d.file_name, storagePath: d.storage_path, mimeType: d.mime_type, sizeBytes: d.size_bytes });
    }));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(r => r.status === "rejected");
    expect(rejected).toHaveLength(7);
    rejected.forEach(r => { if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "TOO_MANY_DOCUMENTS" }); });
    expect(await repo.countForComparison(ca.id, a.userId)).toBe(4);
  });
  it("even backend UPDATE cannot move a document into a full comparison", async () => {
    const a = await createAnonymousUserClient();
    const source = await createComparisonFixture(a.userId); const target = await createComparisonFixture(a.userId);
    const document = await createDocumentFixture(a.userId, source.id);
    for (let i = 0; i < 4; i++) await createDocumentFixture(a.userId, target.id);
    const { error } = await backend.from("quote_documents").update({ comparison_id: target.id, storage_path: `${a.userId}/${target.id}/${document.id}/quote.pdf` }).eq("id", document.id);
    expect(error?.code).toBe("P0001"); expect(error?.message).toContain("DOCUMENT_IDENTITY_IMMUTABLE");
    expect(await new QuoteDocumentRepository(backend).countForComparison(target.id, a.userId)).toBe(4);
  });
  it("DB rechecks draft state when a comparison changes after the API precheck", async () => {
    const a = await createAnonymousUserClient(); const ca = await createComparisonFixture(a.userId);
    const { error: transitionError } = await backend.from("comparisons").update({ status: "processing" }).eq("id", ca.id);
    expect(transitionError).toBeNull();
    const d = documentInput(a.userId, ca.id);
    await expect(new QuoteDocumentRepository(backend).create({ id: d.id, comparisonId: ca.id, ownerId: a.userId, fileName: d.file_name, storagePath: d.storage_path, mimeType: d.mime_type, sizeBytes: d.size_bytes })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
  });
  it("persists numeric extraction schema 1 and rejects JSON/string/null mismatches", async () => {
    const a = await createAnonymousUserClient(); const ca = await createComparisonFixture(a.userId);
    const document = await createDocumentFixture(a.userId, ca.id);
    const { error } = await backend.from("quote_documents").update({ extracted_data: extractedQuote, extraction_schema_version: 1 }).eq("id", document.id);
    expect(error).toBeNull();
    const docs = await new QuoteDocumentRepository(backend).listForComparison(ca.id, a.userId);
    expect(docs[0]?.extractionSchemaVersion).toBe(1);
    for (const patch of [
      { extracted_data: { schemaVersion: "1" }, extraction_schema_version: 1 },
      { extracted_data: {}, extraction_schema_version: 1 },
      { extracted_data: { schemaVersion: 1 }, extraction_schema_version: null },
      { extracted_data: null, extraction_schema_version: 1 },
      { extracted_data: { schemaVersion: 2 }, extraction_schema_version: 2 },
    ]) {
      const { error: invalid } = await backend.from("quote_documents").update(patch).eq("id", document.id);
      expect(invalid?.code).toBe("23514");
    }
  });
});
