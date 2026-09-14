import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { compareQuotes } from "@/modules/comparison/engine";
import { canonicalQuotes } from "../fixtures/comparison";
import { fixture, scope } from "../fixtures/extraction/helpers";

/** Real SDK, synthetic HTTP transport. Tests query semantics, not DB concurrency. */
function harness() {
  const comparison: Record<string, unknown> = { id: scope.comparisonId, owner_id: scope.ownerId, title: "Fixture", status: "draft", result: null, error_code: null, created_at: "2026-09-13T00:00:00Z", updated_at: "2026-09-13T00:00:00.000000+00:00" };
  const document: Record<string, unknown> = { id: scope.documentId, comparison_id: scope.comparisonId, owner_id: scope.ownerId, file_name: "quote.pdf", storage_path: `${scope.ownerId}/${scope.comparisonId}/${scope.documentId}/quote.pdf`, mime_type: "application/pdf", size_bytes: 100, status: "uploaded", extracted_data: null, extraction_schema_version: null, error_code: null, created_at: comparison.created_at, updated_at: comparison.updated_at };
  const calls: { url: URL; method: string; body: unknown }[] = []; let tick = 0;
  const transport = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET"; const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const row = url.pathname.endsWith("/comparisons") ? comparison : document;
    const matches = [...url.searchParams].every(([key, value]) => {
      if (["select", "order"].includes(key)) return true;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (key === "status" && value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row.status));
      throw new Error("Unexpected filter");
    });
    if (matches && method === "PATCH") {
      Object.assign(row, z.record(z.unknown()).parse(body)); row.updated_at = `2026-09-13T00:00:00.${String(++tick).padStart(6, "0")}+00:00`;
    }
    return new Response(JSON.stringify(matches ? [row] : []), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://fixture.invalid", "synthetic-test-key", { global: { fetch: transport }, auth: { persistSession: false, autoRefreshToken: false } });
  return { comparison, document, calls, transport, comparisons: new ComparisonRepository(client), documents: new QuoteDocumentRepository(client) };
}
const comparisonScope = { id: scope.comparisonId, ownerId: scope.ownerId };

describe("official repositories conditional writes", () => {
  it("acquires processing in ONE owner-scoped conditional PATCH without a preceding SELECT", async () => {
    const h = harness(); await h.comparisons.tryAcquireProcessing(comparisonScope);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ method: "PATCH", body: { status: "processing", result: null, error_code: null } });
    expect(h.calls[0]?.url.searchParams.get("status")).toBe("in.(draft,failed)");
    expect(h.calls[0]?.url.searchParams.get("owner_id")).toBe(`eq.${scope.ownerId}`);
    expect(h.calls[0]?.url.searchParams.get("id")).toBe(`eq.${scope.comparisonId}`);
  });
  it("persists result and completed atomically and rejects stale writes to completed", async () => {
    const h = harness(); const lease = await h.comparisons.tryAcquireProcessing(comparisonScope); if (!lease) throw new Error("Missing lease");
    const result = compareQuotes(canonicalQuotes()); const attempt = { ...comparisonScope, updatedAt: lease.updatedAt };
    await h.comparisons.completeProcessing({ ...attempt, result });
    expect(h.calls[1]?.body).toEqual({ result, status: "completed", error_code: null });
    expect(h.calls[1]?.url.searchParams.get("status")).toBe("eq.processing");
    expect(h.calls[1]?.url.searchParams.get("updated_at")).toBe(`eq.${lease.updatedAt}`);
    expect(await h.comparisons.tryAcquireProcessing(comparisonScope)).toBeNull();
    await expect(h.comparisons.failProcessing({ ...attempt, errorCode: "INTERNAL_ERROR" })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.comparison.status).toBe("completed");
  });
  it("fences an older comparison attempt after failed -> processing retry", async () => {
    const h = harness(); const first = await h.comparisons.tryAcquireProcessing(comparisonScope); if (!first) throw new Error("Missing lease");
    await h.comparisons.failProcessing({ ...comparisonScope, updatedAt: first.updatedAt, errorCode: "EXTRACTION_INVALID" });
    const second = await h.comparisons.tryAcquireProcessing(comparisonScope); if (!second) throw new Error("Missing lease");
    await expect(h.comparisons.completeProcessing({ ...comparisonScope, updatedAt: first.updatedAt, result: compareQuotes(canonicalQuotes()) })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(h.comparisons.failProcessing({ ...comparisonScope, updatedAt: first.updatedAt, errorCode: "INTERNAL_ERROR" })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.comparison.status).toBe("processing");
  });
  it.each(["acquire", "complete", "fail"])("comparison %s includes owner restriction", async operation => {
    const h = harness(); const lease = await h.comparisons.tryAcquireProcessing(comparisonScope); if (!lease) throw new Error("Missing lease");
    const wrong = { ...comparisonScope, ownerId: "99999999-9999-4999-8999-999999999999", updatedAt: lease.updatedAt };
    if (operation === "acquire") expect(await h.comparisons.tryAcquireProcessing(wrong)).toBeNull();
    if (operation === "complete") await expect(h.comparisons.completeProcessing({ ...wrong, result: compareQuotes(canonicalQuotes()) })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    if (operation === "fail") await expect(h.comparisons.failProcessing({ ...wrong, errorCode: "INTERNAL_ERROR" })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.comparison.status).toBe("processing");
  });
  it("documents save JSON/version/completed and clear errors in a single guarded PATCH", async () => {
    const h = harness(); const lease = await h.documents.markProcessing(scope);
    await h.documents.completeExtraction({ ...scope, updatedAt: lease.updatedAt, extraction: fixture().expected });
    expect(h.calls[1]?.body).toEqual({ status: "completed", extracted_data: fixture().expected, extraction_schema_version: 1, error_code: null });
    for (const call of h.calls) {
      expect(call.url.searchParams.get("owner_id")).toBe(`eq.${scope.ownerId}`);
      expect(call.url.searchParams.get("comparison_id")).toBe(`eq.${scope.comparisonId}`);
      expect(call.url.searchParams.get("id")).toBe(`eq.${scope.documentId}`);
    }
    expect(h.calls[0]?.url.searchParams.get("status")).toBe("in.(uploaded,failed)");
    expect(h.calls[1]?.url.searchParams.get("updated_at")).toBe(`eq.${lease.updatedAt}`);
    await expect(h.documents.markFailed({ ...scope, updatedAt: lease.updatedAt, errorCode: "EXTRACTION_INVALID" })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(h.documents.markProcessing(scope)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
  });
  it.each(["ownerId", "comparisonId", "documentId"] as const)("every document transition filters %s", async field => {
    const h = harness(); const lease = await h.documents.markProcessing(scope);
    const wrong = { ...scope, [field]: "99999999-9999-4999-8999-999999999999", updatedAt: lease.updatedAt };
    await expect(h.documents.markProcessing(wrong)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(h.documents.completeExtraction({ ...wrong, extraction: fixture().expected })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(h.documents.markFailed({ ...wrong, errorCode: "EXTRACTION_INVALID" })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(h.document.status).toBe("processing");
  });
  it("document failure clears unvalidated extraction/version and fences old callbacks on retry", async () => {
    const h = harness(); const old = await h.documents.markProcessing(scope);
    await h.documents.markFailed({ ...scope, updatedAt: old.updatedAt, errorCode: "EXTRACTION_PROVIDER_ERROR" });
    expect(h.document).toMatchObject({ status: "failed", extracted_data: null, extraction_schema_version: null, error_code: "EXTRACTION_PROVIDER_ERROR" });
    const current = await h.documents.markProcessing(scope);
    await expect(h.documents.completeExtraction({ ...scope, updatedAt: old.updatedAt, extraction: fixture().expected })).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await h.documents.completeExtraction({ ...scope, updatedAt: current.updatedAt, extraction: fixture().expected });
  });
  it("canonical validation happens before either completion write", async () => {
    const h = harness(); const result = compareQuotes(canonicalQuotes()); Reflect.set(result, "winnerId", scope.documentId);
    await expect(h.comparisons.completeProcessing({ ...comparisonScope, updatedAt: "2026-09-13T00:00:00Z", result })).rejects.toThrow();
    await expect(h.documents.completeExtraction({ ...scope, updatedAt: "2026-09-13T00:00:00Z", extraction: {} })).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(h.calls).toHaveLength(0);
  });
  it("maps malformed stored extractions to EXTRACTION_INVALID without weakening validation", async () => {
    const h = harness(); h.document.extracted_data = { schemaVersion: 1 }; h.document.extraction_schema_version = 1;
    await expect(h.documents.listForComparison(scope.comparisonId, scope.ownerId)).rejects.toMatchObject({ code: "EXTRACTION_INVALID", details: null });
  });
  it("does not leak raw database failure messages", async () => {
    const h = harness(); h.transport.mockResolvedValue(new Response(JSON.stringify({ message: "PRIVATE DATABASE SECRET" }), { status: 500 }));
    const error: unknown = await h.comparisons.tryAcquireProcessing(comparisonScope).catch(e => e);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", details: null }); expect(String(error)).not.toContain("PRIVATE");
  });
});
