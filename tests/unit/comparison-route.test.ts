import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/comparisons/[id]/process/route";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { processHarness } from "../fixtures/comparison-process";
import { context } from "../fixtures/extraction/helpers";
import { AppError } from "@/core/errors/app-error";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), backend: vi.fn(), port: vi.fn() }));
vi.mock("@/core/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/core/supabase/backend", () => ({ createSupabaseBackendClient: mocks.backend }));
// Keep the bridge real for the process fixture; replace only runtime composition.
vi.mock("@/modules/comparison/b3-extraction-adapter", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/comparison/b3-extraction-adapter")>(), createB3ExtractionPort: mocks.port,
}));
const request = () => new Request("http://localhost/api/comparisons/id/process", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ ownerId: "attacker", owner_id: "attacker", result: { fake: true }, status: "completed" }),
});
const routeContext = (id = context.comparisonId) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: context.ownerId } }, error: null });
  mocks.backend.mockReturnValue({});
});
function attach() {
  const h = processHarness();
  vi.spyOn(ComparisonRepository.prototype, "findByIdForOwner").mockImplementation(h.comparisonRepository.findByIdForOwner);
  vi.spyOn(ComparisonRepository.prototype, "tryAcquireProcessing").mockImplementation(h.comparisonRepository.tryAcquireProcessing);
  vi.spyOn(ComparisonRepository.prototype, "completeProcessing").mockImplementation(h.comparisonRepository.completeProcessing);
  vi.spyOn(ComparisonRepository.prototype, "failProcessing").mockImplementation(h.comparisonRepository.failProcessing);
  vi.spyOn(QuoteDocumentRepository.prototype, "listForComparison").mockImplementation(h.documentRepository.listForComparison);
  vi.spyOn(QuoteDocumentRepository.prototype, "markFailed").mockImplementation(h.documentRepository.markFailed);
  mocks.port.mockReturnValue(h.extractionPort); return h;
}
async function assertError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json(); expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
  expect(body.error).toEqual({ code, message: expect.any(String), retryable: expect.any(Boolean), details: null });
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/); return body;
}
describe("POST /process route", () => {
  it("rejects absent auth before creating privileged backend", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await assertError(await POST(request(), routeContext()), 401, "UNAUTHENTICATED");
    expect(mocks.backend).not.toHaveBeenCalled(); expect(mocks.port).not.toHaveBeenCalled();
  });
  it("rejects invalid id before privileged composition", async () => {
    await assertError(await POST(request(), routeContext("invalid")), 400, "VALIDATION_ERROR");
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("cross-owner is 404 and has no document/AI calls", async () => {
    const h = attach(); h.comparisonRepository.findByIdForOwner.mockResolvedValue(null);
    await assertError(await POST(request(), routeContext()), 404, "COMPARISON_NOT_FOUND");
    expect(h.documentRepository.listForComparison).not.toHaveBeenCalled(); expect(h.provider.extract).not.toHaveBeenCalled();
  });
  it("returns the serialized comparison and ignores every browser authority field", async () => {
    const h = attach(); h.complete(0); h.complete(1);
    const response = await POST(request(), routeContext()); expect(response.status).toBe(200);
    const body = await response.json(); expect(Object.keys(body).sort()).toEqual(["data", "requestId"]);
    expect(body.data).toMatchObject({ status: "completed", title: "Fixture", errorCode: null });
    expect(body.data.ownerId).toBeUndefined(); expect(body.data.storagePath).toBeUndefined();
    expect(h.comparisonRepository.findByIdForOwner).toHaveBeenCalledWith({ id: context.comparisonId, ownerId: context.ownerId });
    expect(h.provider.extract).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toContain("private, no-store");
    await assertError(await POST(request(), routeContext()), 409, "INVALID_COMPARISON_STATE");
  });
  it("returns B.3 permanent provider failure as retryable false with the canonical envelope", async () => {
    const h = attach(); h.provider.extract.mockRejectedValue(new AppError({ code: "EXTRACTION_PROVIDER_ERROR", status: 502, retryable: false, message: "PRIVATE BILLING BODY", details: "SECRET" }));
    const body = await assertError(await POST(request(), routeContext()), 502, "EXTRACTION_PROVIDER_ERROR");
    expect(body.error.retryable).toBe(false); expect(JSON.stringify(body)).not.toMatch(/PRIVATE|SECRET/);
    expect(h.comparison.status).toBe("failed");
  });
});
