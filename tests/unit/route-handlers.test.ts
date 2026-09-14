import { AuthSessionMissingError, AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createComparison, GET as listComparisons } from "@/app/api/comparisons/route";
import { GET as getComparison } from "@/app/api/comparisons/[id]/route";
import { POST as uploadDocument } from "@/app/api/comparisons/[id]/documents/route";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { AppError } from "@/core/errors/app-error";
import type { Comparison, QuoteDocument } from "@/core/domain/types";
import { MAX_FILE_SIZE_BYTES } from "@/core/validation/upload";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), backend: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/core/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/core/supabase/backend", () => ({ createSupabaseBackendClient: mocks.backend }));

const ownerId = "10000000-0000-4000-8000-000000000001";
const otherOwnerId = "10000000-0000-4000-8000-000000000002";
const comparisonId = "20000000-0000-4000-8000-000000000001";
const comparison: Comparison = { id: comparisonId, ownerId, title: "Original", status: "draft", result: null, errorCode: null, createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z" };
const context = (id = comparisonId) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (body: unknown) => new NextRequest("http://localhost/api/comparisons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
function uploadRequest(bytes: Uint8Array = pdf, type = "application/pdf", name = "quote.pdf") {
  const body = new FormData();
  body.set("file", new File([new Uint8Array(bytes)], name, { type }));
  body.set("owner_id", otherOwnerId);
  body.set("storage_path", "attacker/arbitrary.pdf");
  body.set("status", "completed");
  return new Request(`http://localhost/api/comparisons/${comparisonId}/documents`, { method: "POST", body });
}
async function assertError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
  expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(body.error).toEqual({ code, message: expect.any(String), retryable: expect.any(Boolean), details: null });
  return body;
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
  mocks.backend.mockReturnValue({ storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  vi.spyOn(ComparisonRepository.prototype, "findByIdForOwner").mockResolvedValue(comparison);
  vi.spyOn(ComparisonRepository.prototype, "listByOwner").mockResolvedValue([comparison]);
  vi.spyOn(ComparisonRepository.prototype, "create").mockResolvedValue(comparison);
  vi.spyOn(QuoteDocumentRepository.prototype, "countForComparison").mockResolvedValue(0);
  vi.spyOn(QuoteDocumentRepository.prototype, "listForComparison").mockResolvedValue([]);
  vi.spyOn(QuoteDocumentRepository.prototype, "create").mockImplementation(async (params): Promise<QuoteDocument> => ({ ...params, status: "uploaded", extractedData: null, extractionSchemaVersion: null, errorCode: null, createdAt: comparison.createdAt, updatedAt: comparison.updatedAt }));
});

describe("Route Handlers: backend authority", () => {
  it.each(["create", "list", "detail", "upload"])("%s rejects absent session before privileged access", async (route) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const actions = {
      create: () => createComparison(jsonRequest({ title: "test" })),
      list: () => listComparisons(),
      detail: () => getComparison(new Request("http://localhost"), context()),
      upload: () => uploadDocument(uploadRequest(), context()),
    };
    await assertError(await actions[route as keyof typeof actions](), 401, "UNAUTHENTICATED");
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("rejects invalid session even if a user object is returned", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: new AuthApiError("invalid JWT", 401, "bad_jwt") });
    await assertError(await listComparisons(), 401, "UNAUTHENTICATED");
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("GET returns 404 for another owner's comparison without loading documents", async () => {
    vi.mocked(ComparisonRepository.prototype.findByIdForOwner).mockResolvedValue(null);
    await assertError(await getComparison(new Request("http://localhost"), context()), 404, "COMPARISON_NOT_FOUND");
    expect(ComparisonRepository.prototype.findByIdForOwner).toHaveBeenCalledWith({ id: comparisonId, ownerId });
    expect(QuoteDocumentRepository.prototype.listForComparison).not.toHaveBeenCalled();
  });
  it("cross-owner upload is 404 before Storage or metadata access", async () => {
    vi.mocked(ComparisonRepository.prototype.findByIdForOwner).mockResolvedValue(null);
    await assertError(await uploadDocument(uploadRequest(), context()), 404, "COMPARISON_NOT_FOUND");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("owner/status/result spoof is discarded and owner comes from the validated session", async () => {
    const response = await createComparison(jsonRequest({ title: "Original", owner_id: otherOwnerId, ownerId: otherOwnerId, status: "completed", result: { arbitrary: true } }));
    expect(response.status).toBe(201);
    expect(ComparisonRepository.prototype.create).toHaveBeenCalledExactlyOnceWith({ ownerId, title: "Original" });
    const body = await response.json();
    expect(body.data.status).toBe("draft");
    expect(body.data.result).toBeNull();
    expect(body.data.ownerId).toBeUndefined();
    expect(body.requestId).toEqual(expect.any(String));
  });
  it("GET list and detail scope every repository read to the session owner", async () => {
    expect((await listComparisons()).status).toBe(200);
    expect((await getComparison(new Request("http://localhost"), context())).status).toBe(200);
    expect(ComparisonRepository.prototype.listByOwner).toHaveBeenCalledWith(ownerId);
    expect(QuoteDocumentRepository.prototype.listForComparison).toHaveBeenCalledWith(comparisonId, ownerId);
  });
  it.each(["detail", "upload"])("%s validates UUID before privileged client/Postgres", async (route) => {
    const response = route === "detail"
      ? await getComparison(new Request("http://localhost"), context("banana"))
      : await uploadDocument(uploadRequest(), context("banana"));
    await assertError(response, 400, "VALIDATION_ERROR");
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("unknown errors use the canonical envelope without exposing internal details", async () => {
    mocks.backend.mockImplementation(() => { throw new Error("sensitive-credential database stack"); });
    const body = await assertError(await listComparisons(), 500, "INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("sensitive-credential");
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("sensitive-credential");
  });
});

describe("Route Handlers: document upload", () => {
  it("persists a sanitized filename matching the authoritative path and ignores spoofed metadata", async () => {
    const response = await uploadDocument(uploadRequest(pdf, "application/pdf", "../../arquivo.pdf"), context());
    expect(response.status).toBe(201);
    const params = vi.mocked(QuoteDocumentRepository.prototype.create).mock.calls[0]![0];
    expect(params.ownerId).toBe(ownerId);
    expect(params.fileName).toBe("arquivo.pdf");
    expect(params.storagePath).toBe(`${ownerId}/${comparisonId}/${params.id}/arquivo.pdf`);
    expect(params).not.toHaveProperty("status");
    expect(mocks.upload).toHaveBeenCalledWith(params.storagePath, pdf, { contentType: "application/pdf", upsert: false });
    const body = await response.json();
    expect(body.data.status).toBe("uploaded");
    expect(body.data.extractedData).toBeNull();
    expect(body.data.extractionSchemaVersion).toBeNull();
    expect(body.data).not.toHaveProperty("storagePath");
  });
  it("FILE_TOO_LARGE is returned before any Storage write", async () => {
    const bytes = new Uint8Array(MAX_FILE_SIZE_BYTES + 1); bytes.set(pdf);
    await assertError(await uploadDocument(uploadRequest(bytes), context()), 413, "FILE_TOO_LARGE");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each([
    ["application/octet-stream", "payload.exe", pdf],
    ["application/pdf", "quote.pdf", new TextEncoder().encode("<html>hostile</html>")],
    ["image/png", "quote.pdf", pdf],
  ])("rejects unsupported/inconsistent file %s %s", async (mime, name, bytes) => {
    await assertError(await uploadDocument(uploadRequest(bytes, mime, name), context()), 415, "UNSUPPORTED_FILE_TYPE");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("TOO_MANY_DOCUMENTS fast path avoids uploading", async () => {
    vi.mocked(QuoteDocumentRepository.prototype.countForComparison).mockResolvedValue(4);
    await assertError(await uploadDocument(uploadRequest(), context()), 409, "TOO_MANY_DOCUMENTS");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each(["processing", "completed", "failed"] as const)("INVALID_COMPARISON_STATE rejects %s", async (status) => {
    vi.mocked(ComparisonRepository.prototype.findByIdForOwner).mockResolvedValue({ ...comparison, status });
    await assertError(await uploadDocument(uploadRequest(), context()), 409, "INVALID_COMPARISON_STATE");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("Storage failure never creates a DB row", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("upload failed") });
    await assertError(await uploadDocument(uploadRequest(), context()), 500, "VALIDATION_ERROR");
    expect(QuoteDocumentRepository.prototype.create).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each(["success", "returned-error", "thrown-error"])("DB rejection preserves the original error after cleanup %s", async (cleanup) => {
    vi.mocked(QuoteDocumentRepository.prototype.create).mockRejectedValue(new AppError({ code: "TOO_MANY_DOCUMENTS", message: "Concurrent insert reached the limit.", status: 409, retryable: false }));
    if (cleanup === "returned-error") mocks.remove.mockResolvedValue({ error: new Error("cleanup failed") });
    if (cleanup === "thrown-error") mocks.remove.mockRejectedValue(new Error("cleanup network failure"));
    await assertError(await uploadDocument(uploadRequest(), context()), 409, "TOO_MANY_DOCUMENTS");
    const uploadedPath = mocks.upload.mock.calls[0]![0];
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([uploadedPath]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(cleanup === "success" ? "cleanup_ok" : "cleanup_failed"));
  });
});
