import { describe, expect, it } from "vitest";
import {
  validateUpload,
  MAX_FILE_SIZE_BYTES,
} from "@/core/validation/upload";
import { AppError } from "@/core/errors/app-error";

describe("validateUpload", () => {
  it("accepts a valid PDF under the size limit", () => {
    expect(() =>
      validateUpload({
        mimeType: "application/pdf",
        fileName: "orcamento.pdf",
        sizeBytes: 1024,
      })
    ).not.toThrow();
  });

  it.each(["application/pdf", "image/png", "image/jpeg", "image/webp"])(
    "accepts allowed MIME type %s",
    (mimeType) => {
      const ext = mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1];
      expect(() =>
        validateUpload({
          mimeType,
          fileName: `file.${ext}`,
          sizeBytes: 1024,
        })
      ).not.toThrow();
    }
  );

  it("rejects an unsupported MIME type with UNSUPPORTED_FILE_TYPE", () => {
    try {
      validateUpload({
        mimeType: "application/x-msdownload",
        fileName: "malware.exe",
        sizeBytes: 1024,
      });
      throw new Error("expected validateUpload to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  it("rejects a file over 10 MiB with FILE_TOO_LARGE", () => {
    try {
      validateUpload({
        mimeType: "application/pdf",
        fileName: "grande.pdf",
        sizeBytes: MAX_FILE_SIZE_BYTES + 1,
      });
      throw new Error("expected validateUpload to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("FILE_TOO_LARGE");
    }
  });

  it("accepts a file exactly at the 10 MiB limit", () => {
    expect(() =>
      validateUpload({
        mimeType: "application/pdf",
        fileName: "limite.pdf",
        sizeBytes: MAX_FILE_SIZE_BYTES,
      })
    ).not.toThrow();
  });

  it("rejects a mismatched extension for the declared MIME type", () => {
    try {
      validateUpload({
        mimeType: "image/png",
        fileName: "arquivo.pdf",
        sizeBytes: 1024,
      });
      throw new Error("expected validateUpload to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });
});
