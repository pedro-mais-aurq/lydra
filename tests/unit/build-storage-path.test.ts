import { describe, expect, it } from "vitest";
import { buildStoragePath } from "@/core/storage/build-storage-path";

describe("buildStoragePath", () => {
  it("produces the canonical <owner>/<comparison>/<document>/<file> shape", () => {
    const path = buildStoragePath({
      ownerId: "4f0aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      comparisonId: "22caaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      documentId: "c11aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      fileName: "orcamento-fornecedor-a.pdf",
    });

    expect(path).toBe(
      "4f0aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/22caaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/c11aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/orcamento-fornecedor-a.pdf"
    );
  });

  it("never lets a traversal filename escape the constructed path", () => {
    const path = buildStoragePath({
      ownerId: "owner-1",
      comparisonId: "comp-1",
      documentId: "doc-1",
      fileName: "../../../etc/passwd",
    });

    const segments = path.split("/");
    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe("owner-1");
    expect(segments[1]).toBe("comp-1");
    expect(segments[2]).toBe("doc-1");
    expect(segments[3]).not.toContain("..");
  });
});
