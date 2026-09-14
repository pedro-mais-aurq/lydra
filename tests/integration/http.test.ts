import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { backend, createAnonymousUserClient, createComparisonFixture, trackStoragePath } from "./helpers";
import { POST as createComparison, GET as listComparisons } from "@/app/api/comparisons/route";
import { GET as getComparison } from "@/app/api/comparisons/[id]/route";
import { POST as uploadDocument } from "@/app/api/comparisons/[id]/documents/route";
// Only Next's cookie-to-client boundary is replaced. Auth.getUser, repositories,
// privileged factory, PostgREST and Storage all execute against local Supabase.
const session = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/core/supabase/server", () => ({ createSupabaseServerClient: async () => {
  if (!session.client) throw new Error("test session missing");
  return session.client;
} }));
const context = (id: string) => ({ params: Promise.resolve({ id }) });
describe("HTTP handlers with real Auth, DB and Storage", () => {
  it("cross-owner GET and upload return 404 while each owner can read its own data", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const ca = await createComparisonFixture(a.userId); const cb = await createComparisonFixture(b.userId);
    for (const [user, own, other] of [[a, ca, cb], [b, cb, ca]] as const) {
      session.client = user.client;
      expect((await getComparison(new Request("http://localhost"), context(own.id))).status).toBe(200);
      const response = await getComparison(new Request("http://localhost"), context(other.id));
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("COMPARISON_NOT_FOUND");
      expect((await uploadDocument(new Request("http://localhost", { method: "POST" }), context(other.id))).status).toBe(404);
    }
  });
  it("spoofed owner/status/result never reach persistence; authorized upload works after grant revocation", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient(); session.client = a.client;
    const response = await createComparison(new NextRequest("http://localhost/api/comparisons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "API fixture", owner_id: b.userId, status: "completed", result: { forged: true } }) }));
    expect(response.status).toBe(201);
    const listed = await listComparisons();
    expect(listed.status).toBe(200);
    const listedData = (await listed.json()).data;
    session.client = b.client;
    expect((await (await listComparisons()).json()).data).toEqual([]);
    session.client = a.client;
    const { data: created } = await response.json();
    expect(listedData.some((c: { id: string }) => c.id === created.id)).toBe(true);
    const { data: persisted, error } = await backend.from("comparisons").select().eq("id", created.id).single();
    expect(error).toBeNull(); expect(persisted.owner_id).toBe(a.userId);
    expect(persisted.status).toBe("draft"); expect(persisted.result).toBeNull();
    const body = new FormData();
    body.set("file", new File(["%PDF-1.7\nfixture"], "../../quote.pdf", { type: "application/pdf" }));
    body.set("owner_id", b.userId); body.set("status", "completed"); body.set("storage_path", "forged");
    const upload = await uploadDocument(new Request("http://localhost", { method: "POST", body }), context(created.id));
    expect(upload.status).toBe(201);
    const { data: doc } = await upload.json();
    const { data: row, error: docError } = await backend.from("quote_documents").select().eq("id", doc.id).single();
    expect(docError).toBeNull(); trackStoragePath(row.storage_path);
    expect(row.owner_id).toBe(a.userId); expect(row.file_name).toBe("quote.pdf");
    expect(row.storage_path).toBe(`${a.userId}/${created.id}/${doc.id}/quote.pdf`);
    expect(row.status).toBe("uploaded"); expect(row.extracted_data).toBeNull();
  });
});

describe("real upload MIME/signature boundary", () => {
  it.each([["pdf", "application/pdf"], ["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]])("accepts valid %s", async (extension, mime) => {
    const a = await createAnonymousUserClient(); session.client = a.client;
    const comparison = await createComparisonFixture(a.userId);
    const bytes = new Uint8Array(readFileSync(`tests/fixtures/uploads/valid.${extension}`));
    const form = new FormData(); form.set("file", new File([bytes], `valid.${extension}`, { type: mime }));
    const response = await uploadDocument(new Request("http://localhost", { method: "POST", body: form }), context(comparison.id));
    expect(response.status).toBe(201);
    const { data } = await response.json();
    const path = `${a.userId}/${comparison.id}/${data.id}/valid.${extension}`; trackStoragePath(path);
    const download = await a.client.storage.from("quote-documents").download(path);
    expect(download.error).toBeNull();
    expect(new Uint8Array(await download.data!.arrayBuffer())).toEqual(bytes);
  });
  it.each(["unsupported", "oversize", "false MIME", "false extension", "bad magic", "empty"])("rejects %s before persistence", async scenario => {
    const a = await createAnonymousUserClient(); session.client = a.client;
    const comparison = await createComparisonFixture(a.userId);
    let bytes: Uint8Array = new Uint8Array(readFileSync("tests/fixtures/uploads/valid.pdf"));
    let mime = "application/pdf"; let name = "quote.pdf";
    if (scenario === "unsupported") { mime = "text/plain"; name = "quote.txt"; }
    if (scenario === "oversize") bytes = new Uint8Array(10485761);
    if (scenario === "false MIME") { mime = "image/png"; name = "quote.png"; }
    if (scenario === "false extension") name = "quote.png";
    if (scenario === "bad magic") bytes = new TextEncoder().encode("not a PDF");
    if (scenario === "empty") bytes = new Uint8Array();
    const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], name, { type: mime }));
    const response = await uploadDocument(new Request("http://localhost", { method: "POST", body: form }), context(comparison.id));
    expect(response.status).toBeGreaterThanOrEqual(400); expect(response.status).toBeLessThan(500);
    const { data, error } = await backend.from("quote_documents").select("id").eq("comparison_id", comparison.id);
    expect(error).toBeNull(); expect(data).toEqual([]);
  });
});

describe("real Storage/DB compensation", () => {
  it("removes a successful upload when the DB rejects a state change race", async () => {
    const a = await createAnonymousUserClient(); session.client = a.client;
    const comparison = await createComparisonFixture(a.userId);
    const original = QuoteDocumentRepository.prototype.create;
    let uploadedPath = "";
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const insert = vi.spyOn(QuoteDocumentRepository.prototype, "create").mockImplementation(async function (this: QuoteDocumentRepository, params) {
      uploadedPath = params.storagePath; trackStoragePath(uploadedPath);
      expect((await backend.storage.from("quote-documents").download(uploadedPath)).error).toBeNull();
      expect((await backend.from("comparisons").update({ status: "processing" }).eq("id", comparison.id)).error).toBeNull();
      return original.call(this, params); // Real INSERT fails on the authoritative DB state guard.
    });
    try {
      const form = new FormData(); form.set("file", new File([new Uint8Array(readFileSync("tests/fixtures/uploads/valid.pdf"))], "quote.pdf", { type: "application/pdf" }));
      const response = await uploadDocument(new Request("http://localhost", { method: "POST", body: form }), context(comparison.id));
      expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("INVALID_COMPARISON_STATE");
      expect(uploadedPath).not.toBe("");
      expect((await backend.storage.from("quote-documents").download(uploadedPath)).data).toBeNull();
      expect(logs).toHaveBeenCalledWith(expect.stringContaining("cleanup_ok"));
      expect(JSON.stringify(logs.mock.calls)).not.toContain("%PDF");
      expect((await backend.from("quote_documents").select("id").eq("comparison_id", comparison.id)).data).toEqual([]);
    } finally { insert.mockRestore(); logs.mockRestore(); }
  });
});
