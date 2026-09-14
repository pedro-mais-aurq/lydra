import { afterEach, describe, expect, it, vi } from "vitest";
import { selectFiles, validSubmission, createAndUpload } from "@/modules/product/uploads";
import { comparisonApi, ProductError } from "@/modules/product/api";
import { completedDetail } from "../../fixtures/product";
const file = (name = "quote.pdf", type = "application/pdf", size = 20) => new File([new Uint8Array(size)], name, { type });
afterEach(() => vi.restoreAllMocks());
describe("product upload flow", () => {
  it.each([1, 2, 4])("validates %i files", (count) => { expect(validSubmission("Obra", Array.from({ length: count }, () => file()))).toBe(count >= 2); });
  it("rejects the fifth file", () => { const selection = selectFiles(Array.from({ length: 4 }, () => file()), [file()]); expect(selection.files).toHaveLength(4); expect(selection.error).toContain("máximo 4"); });
  it("rejects above 10 MiB, unsupported MIME, empty file and keeps File references", () => {
    const allowed = file(); const selection = selectFiles([], [allowed, file("large.pdf", "application/pdf", 10485761), file("x.svg", "image/svg+xml"), file("empty.pdf", "application/pdf", 0)]);
    expect(selection.files).toEqual([allowed]); expect(selection.files[0]).toBe(allowed); expect(selection.error).toContain("large.pdf"); expect(selection.error).toContain("x.svg"); expect(selection.error).toContain("empty.pdf");
  });
  it("rejects blank title before auth/create", async () => {
    const ensureSession = vi.fn(); const create = vi.spyOn(comparisonApi, "create");
    await expect(createAndUpload({ title: "  ", files: [file(), file()], ensureSession, onCreated: vi.fn(), onUploading: vi.fn(), onUploaded: vi.fn() })).rejects.toThrow();
    expect(ensureSession).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
  it("does not make an authenticated API call on Auth failure", async () => {
    const create = vi.spyOn(comparisonApi, "create");
    await expect(createAndUpload({ title: "Obra", files: [file(), file()], ensureSession: vi.fn().mockRejectedValue(new Error("auth")), onCreated: vi.fn(), onUploading: vi.fn(), onUploaded: vi.fn() })).rejects.toThrow("auth"); expect(create).not.toHaveBeenCalled();
  });
  it("stops on partial failure without recreating, reuploading or processing", async () => {
    const detail = completedDetail();
    const create = vi.spyOn(comparisonApi, "create").mockResolvedValue({ ...detail, status: "draft", result: null });
    const upload = vi.spyOn(comparisonApi, "upload").mockResolvedValueOnce(detail.documents[0]!).mockRejectedValueOnce(new ProductError("INTERNAL_ERROR", true));
    const process = vi.spyOn(comparisonApi, "process"); const uploaded = vi.fn();
    await expect(createAndUpload({ title: "  Obra  ", files: [file(), file(), file()], ensureSession: vi.fn(), onCreated: vi.fn(), onUploading: vi.fn(), onUploaded: uploaded })).rejects.toThrow();
    expect(create).toHaveBeenCalledExactlyOnceWith("Obra"); expect(upload).toHaveBeenCalledTimes(2); expect(uploaded).toHaveBeenCalledTimes(1); expect(process).not.toHaveBeenCalled();
  });
});
