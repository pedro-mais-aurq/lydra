import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseExtractionStore } from "@/modules/extraction/infrastructure/supabase-extraction.store";
import { fixture, pdfInput, scope } from "../../fixtures/extraction/helpers";
import { z } from "zod";

/** Actual Supabase SDK over an in-memory HTTP transport. This proves request
 * filters/payload/CAS behavior, not PostgreSQL, RLS or Storage enforcement. */
function harness() {
  const bytes = pdfInput().bytes;
  const row: Record<string, unknown> = {
    id: scope.documentId, comparison_id: scope.comparisonId, owner_id: scope.ownerId,
    file_name: "quote.pdf", storage_path: scope.ownerId + "/" + scope.comparisonId + "/" + scope.documentId + "/quote.pdf",
    mime_type: "application/pdf", size_bytes: bytes.byteLength,
    status: "uploaded", extracted_data: null, extraction_schema_version: null, error_code: null,
    updated_at: "2026-09-12T12:00:00.000000+00:00",
  };
  const calls: { url: URL; method: string; body: unknown }[] = [];
  let tick = 0;
  const transport = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.pathname.includes("/storage/v1/object/")) return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf" } });
    if (url.pathname !== "/rest/v1/quote_documents") throw new Error("Unexpected table/network access.");
    const match = [...url.searchParams].every(([key, value]) => {
      if (key === "select") return true;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (key === "status" && value === "in.(uploaded,failed)") return row.status === "uploaded" || row.status === "failed";
      throw new Error("Unexpected filter.");
    });
    if (match && method === "PATCH") {
      Object.assign(row, z.record(z.unknown()).parse(body));
      row.updated_at = "2026-09-12T12:00:00." + String(++tick).padStart(6, "0") + "+00:00";
    }
    const selected = Object.fromEntries((url.searchParams.get("select") ?? "").split(",").map(key => [key, row[key]]));
    return new Response(JSON.stringify(match ? [selected] : []), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://supabase.test.invalid", "synthetic-backend-key", { global: { fetch: transport }, auth: { persistSession: false, autoRefreshToken: false } });
  return { row, calls, transport, store: new SupabaseExtractionStore(client) };
}

describe("B19/B20 — persistence and explicit owner scoping", () => {
  it("atomically saves validated JSON, numeric version, completed and null error", async () => {
    const { store, row, calls } = harness();
    const lease = await store.markProcessing(scope);
    await store.saveCompletedExtraction(scope, lease, fixture().expected);
    expect(row).toMatchObject({ status: "completed", extracted_data: fixture().expected, extraction_schema_version: 1, error_code: null });
    const write = calls[1];
    expect(write?.body).toEqual({ status: "completed", extracted_data: fixture().expected, extraction_schema_version: 1, error_code: null });
    expect(write?.url.searchParams.get("status")).toBe("eq.processing");
    expect(write?.url.searchParams.get("updated_at")).toBe("eq." + lease.updatedAt);
    expect(calls).toHaveLength(2);
  });

  it("atomically saves failed and clears extraction/version with canonical error", async () => {
    const { store, row } = harness();
    const lease = await store.markProcessing(scope);
    await store.markFailed(scope, lease, "EXTRACTION_INVALID");
    expect(row).toMatchObject({ status: "failed", extracted_data: null, extraction_schema_version: null, error_code: "EXTRACTION_INVALID" });
  });

  it("every DB read/write has owner, comparison and document filters", async () => {
    const { store, calls } = harness();
    await store.loadDocument(scope);
    const first = await store.markProcessing(scope);
    await store.downloadDocument(scope);
    await store.markFailed(scope, first, "EXTRACTION_PROVIDER_ERROR");
    const second = await store.markProcessing(scope);
    await store.saveCompletedExtraction(scope, second, fixture().expected);
    for (const call of calls.filter(c => c.url.pathname.startsWith("/rest/"))) {
      expect(call.url.searchParams.get("owner_id")).toBe("eq." + scope.ownerId);
      expect(call.url.searchParams.get("comparison_id")).toBe("eq." + scope.comparisonId);
      expect(call.url.searchParams.get("id")).toBe("eq." + scope.documentId);
    }
    expect(calls.every(c => !c.url.pathname.includes("/comparisons") && !c.url.pathname.includes("/public/") && !c.url.pathname.includes("/sign/"))).toBe(true);
  });

  it.each(["ownerId", "comparisonId", "documentId"] as const)("rejects wrong %s on reads and writes", async field => {
    const { store, row, calls } = harness();
    const wrong = { ...scope, [field]: "99999999-9999-4999-8999-999999999999" };
    await expect(store.loadDocument(wrong)).rejects.toMatchObject({ code: "COMPARISON_NOT_FOUND", status: 404 });
    await expect(store.downloadDocument(wrong)).rejects.toMatchObject({ code: "COMPARISON_NOT_FOUND" });
    await expect(store.markProcessing(wrong)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    const lease = await store.markProcessing(scope);
    await expect(store.saveCompletedExtraction(wrong, lease, fixture().expected)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(store.markFailed(wrong, lease, "EXTRACTION_INVALID")).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(row.status).toBe("processing");
    expect(calls.some(c => c.url.pathname.includes("/storage/"))).toBe(false);
  });

  it("does not read a tampered private path, even when the row IDs match", async () => {
    const { store, row, calls } = harness();
    row.storage_path = "another-owner/private.pdf";
    await expect(store.downloadDocument(scope)).rejects.toMatchObject({ code: "COMPARISON_NOT_FOUND" });
    expect(calls.some(c => c.url.pathname.includes("/storage/"))).toBe(false);
  });

  it("validates byte length against authorized metadata", async () => {
    const { store, row } = harness();
    row.size_bytes = 10;
    await expect(store.downloadDocument(scope)).rejects.toMatchObject({ code: "EXTRACTION_UNSUPPORTED_INPUT" });
  });

  it("revalidates output at the write boundary before any SQL request", async () => {
    const { store, transport } = harness();
    await expect(store.saveCompletedExtraction(scope, { updatedAt: "2026-09-12T00:00:00Z" }, { schemaVersion: 1, confidence: 1 })).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("allows only one claim and protects completed from stale failure/success writes", async () => {
    const { store, row } = harness();
    const claims = await Promise.allSettled([store.markProcessing(scope), store.markProcessing(scope)]);
    expect(claims.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const first = claims.find(result => result.status === "fulfilled");
    if (!first || first.status !== "fulfilled") throw new Error("Expected one processing lease.");
    await store.saveCompletedExtraction(scope, first.value, fixture().expected);
    await expect(store.markFailed(scope, first.value, "EXTRACTION_INVALID")).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(store.markProcessing(scope)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(row.status).toBe("completed");
  });

  it("does not let an old attempt finish after an explicit failed retry", async () => {
    const { store, row } = harness();
    const oldLease = await store.markProcessing(scope);
    await store.markFailed(scope, oldLease, "EXTRACTION_PROVIDER_ERROR");
    const current = await store.markProcessing(scope);
    await expect(store.saveCompletedExtraction(scope, oldLease, fixture().expected)).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    await expect(store.markFailed(scope, oldLease, "EXTRACTION_INVALID")).rejects.toMatchObject({ code: "INVALID_COMPARISON_STATE" });
    expect(row.status).toBe("processing");
    await store.saveCompletedExtraction(scope, current, fixture().expected);
    expect(row.status).toBe("completed");
  });

  it("returns sanitized errors when PostgREST fails", async () => {
    const { store, transport } = harness();
    transport.mockResolvedValue(new Response(JSON.stringify({ message: "PRIVATE_DB_SECRET", code: "XX000" }), { status: 400 }));
    const error: unknown = await store.loadDocument(scope).catch(e => e);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", details: null });
    expect(String(error)).not.toContain("PRIVATE_DB_SECRET");
  });
});
