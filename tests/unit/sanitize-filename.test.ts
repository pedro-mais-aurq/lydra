import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/core/storage/sanitize-filename";

describe("sanitizeFileName", () => {
  it("keeps a simple safe filename intact", () => {
    expect(sanitizeFileName("orcamento-fornecedor-a.pdf")).toBe(
      "orcamento-fornecedor-a.pdf"
    );
  });

  it("strips directory traversal segments (contract section 35)", () => {
    const result = sanitizeFileName("../../arquivo.pdf");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("strips backslash path segments", () => {
    const result = sanitizeFileName("..\\..\\windows\\arquivo.pdf");
    expect(result).not.toContain("\\");
    expect(result).not.toContain("..");
  });

  it("neutralizes control characters", () => {
    const result = sanitizeFileName("arquivo\u0000\u0007.pdf");
    expect(/[\u0000-\u001f]/.test(result)).toBe(false);
  });

  it("drops an unrecognized/unsafe extension", () => {
    const result = sanitizeFileName("script.exe");
    expect(result.endsWith(".exe")).toBe(false);
  });

  it("truncates excessively long names", () => {
    const longName = `${"a".repeat(500)}.pdf`;
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("falls back to a safe basename when nothing usable remains", () => {
    const result = sanitizeFileName("....");
    expect(result.length).toBeGreaterThan(0);
  });
});
