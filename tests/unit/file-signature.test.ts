import { describe, expect, it } from "vitest";
import { validateFileSignature } from "@/core/validation/file-signature";
const signatures = [
  ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46, 12, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]],
] as const;
describe("lightweight signatures", () => {
  it.each(signatures)("recognizes %s and rejects mismatched MIME", (mime, header) => {
    expect(() => validateFileSignature(new Uint8Array(header), mime)).not.toThrow();
    const otherMime = mime === "image/png" ? "application/pdf" : "image/png";
    expect(() => validateFileSignature(new Uint8Array(header), otherMime)).toThrow(expect.objectContaining({ code: "UNSUPPORTED_FILE_TYPE" }));
  });
  it.each(signatures)("rejects empty/truncated %s", (mime, header) => {
    expect(() => validateFileSignature(new Uint8Array(), mime)).toThrow();
    expect(() => validateFileSignature(new Uint8Array(header.slice(0, 2)), mime)).toThrow();
  });
  it("does not accept a RIFF WAVE or an arbitrary RIFF WEBP payload", () => {
    for (const value of ["RIFF1234WAVEfmt ", "RIFF1234WEBPjunk"]) {
      expect(() => validateFileSignature(new TextEncoder().encode(value), "image/webp")).toThrow();
    }
  });
});
