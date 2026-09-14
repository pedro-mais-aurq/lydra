import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as createRoute } from "@/app/api/comparisons/route";
import { POST as uploadRoute } from "@/app/api/comparisons/[id]/documents/route";
import { GET as detailRoute } from "@/app/api/comparisons/[id]/route";
import { POST as processRoute } from "@/app/api/comparisons/[id]/process/route";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { processHarness } from "../../fixtures/comparison-process";
import { canonicalQuotes } from "../../fixtures/comparison";
import { createAndUpload } from "@/modules/product/uploads";
import { comparisonApi } from "@/modules/product/api";
import { startProcessing, retryFor } from "@/modules/product/processing";
import { AppError } from "@/core/errors/app-error";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), backend: vi.fn(), upload: vi.fn(), port: vi.fn() }));
vi.mock("@/core/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/core/supabase/backend", () => ({ createSupabaseBackendClient: mocks.backend }));
vi.mock("@/modules/comparison/b3-extraction-adapter", async (original) => ({ ...await original<typeof import("@/modules/comparison/b3-extraction-adapter")>(), createB3ExtractionPort: mocks.port }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "log").mockImplementation(() => {}); });
function setup() {
  const h = processHarness(0); const sequence: string[] = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: h.comparison.ownerId } }, error: null });
  mocks.backend.mockReturnValue({ storage: { from: () => ({ upload: mocks.upload, remove: vi.fn().mockResolvedValue({ error: null }) }) } });
  mocks.upload.mockResolvedValue({ error: null }); mocks.port.mockReturnValue(h.extractionPort);
  vi.spyOn(ComparisonRepository.prototype, "create").mockImplementation(async ({ title }) => { h.comparison.title = title; return structuredClone(h.comparison); });
  vi.spyOn(ComparisonRepository.prototype, "findByIdForOwner").mockImplementation(h.comparisonRepository.findByIdForOwner);
  vi.spyOn(ComparisonRepository.prototype, "tryAcquireProcessing").mockImplementation(h.comparisonRepository.tryAcquireProcessing);
  vi.spyOn(ComparisonRepository.prototype, "completeProcessing").mockImplementation(h.comparisonRepository.completeProcessing);
  vi.spyOn(ComparisonRepository.prototype, "failProcessing").mockImplementation(h.comparisonRepository.failProcessing);
  vi.spyOn(QuoteDocumentRepository.prototype, "listForComparison").mockImplementation(h.documentRepository.listForComparison);
  vi.spyOn(QuoteDocumentRepository.prototype, "countForComparison").mockImplementation(async () => h.documents.length);
  vi.spyOn(QuoteDocumentRepository.prototype, "create").mockImplementation(async (params) => {
    const document = { ...params, status: "uploaded" as const, extractedData: null, extractionSchemaVersion: null, errorCode: null, createdAt: h.comparison.createdAt, updatedAt: h.comparison.updatedAt };
    h.documents.push(document); return structuredClone(document);
  });
  const routeContext = { params: Promise.resolve({ id: h.comparison.id }) };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const request = new NextRequest(`http://localhost${url}`, { ...init, signal: init?.signal ?? undefined });
    if (url === "/api/comparisons") { sequence.push("create"); return createRoute(request); }
    if (url.endsWith("/documents")) { sequence.push("upload"); return uploadRoute(request, routeContext); }
    if (url.endsWith("/process")) { sequence.push("process"); return processRoute(request, routeContext); }
    sequence.push("get"); return detailRoute(request, routeContext);
  }));
  return { h, sequence };
}
async function prepare() {
  return createAndUpload({ title: "  Reforma  ", files: [0, 1, 2].map((i) => new File(["%PDF-1.7\nfixture"], `quote-${i}.pdf`, { type: "application/pdf" })), ensureSession: async () => {}, onCreated: () => {}, onUploading: () => {}, onUploaded: () => {} });
}
describe("product → real HTTP handlers → B3 → C", () => {
  it("creates/uploads/processes then reconstructs persisted result via GET", async () => {
    const { h, sequence } = setup();
    for (const input of canonicalQuotes()) h.provider.extract.mockResolvedValueOnce(input.quote);
    const created = await prepare(); expect(created.status).toBe("draft"); await startProcessing(created.id);
    const result = await comparisonApi.get(created.id); expect(result.status).toBe("completed"); expect(result.title).toBe("Reforma");
    expect(result.result?.suppliers.map((supplier) => supplier.costAssessment.knownComparableTotal)).toEqual([4700, 4570, 4300]);
    expect(result.result?.highlights.lowestCompleteKnownCostDocumentId).toBe(result.result?.suppliers[1]?.documentId);
    expect(sequence.slice(0, 5)).toEqual(["create", "upload", "upload", "upload", "process"]);
    await comparisonApi.get(created.id); expect(h.provider.extract).toHaveBeenCalledTimes(3); expect(sequence.filter((stage) => stage === "process")).toHaveLength(1);
  });
  it("retries only the existing pipeline and reuses completed extraction", async () => {
    const { h, sequence } = setup();
    h.provider.extract.mockResolvedValueOnce(canonicalQuotes()[0]!.quote).mockRejectedValueOnce(new AppError({ code: "EXTRACTION_PROVIDER_ERROR", status: 502, retryable: true, message: "Transient" }));
    const created = await prepare(); await startProcessing(created.id); const failed = await comparisonApi.get(created.id);
    expect(failed.status).toBe("failed"); expect(retryFor(failed)?.retryable).toBe(true); expect(h.documents.filter((document) => document.status === "completed")).toHaveLength(1);
    h.provider.extract.mockResolvedValueOnce(canonicalQuotes()[1]!.quote).mockResolvedValueOnce(canonicalQuotes()[2]!.quote);
    await startProcessing(created.id); expect((await comparisonApi.get(created.id)).status).toBe("completed");
    expect(h.provider.extract).toHaveBeenCalledTimes(4); expect(sequence.filter((stage) => stage === "create")).toHaveLength(1); expect(sequence.filter((stage) => stage === "upload")).toHaveLength(3);
  });
});
