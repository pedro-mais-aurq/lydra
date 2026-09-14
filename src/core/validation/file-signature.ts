import { AppError } from "@/core/errors/app-error";

/** Header validation only; no OCR, decompression or document parsing. */
export function validateFileSignature(bytes: Uint8Array, mimeType: string): void {
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  const valid = {
    "application/pdf": starts([0x25, 0x50, 0x44, 0x46, 0x2d]),
    "image/png": starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "image/jpeg": starts([0xff, 0xd8, 0xff]),
    "image/webp": starts([0x52, 0x49, 0x46, 0x46]) &&
      starts([0x57, 0x45, 0x42, 0x50], 8) &&
      (starts([0x56, 0x50, 0x38, 0x20], 12) ||
        starts([0x56, 0x50, 0x38, 0x4c], 12) ||
        starts([0x56, 0x50, 0x38, 0x58], 12)),
  };
  if (!valid[mimeType as keyof typeof valid]) {
    throw new AppError({ code: "UNSUPPORTED_FILE_TYPE", message: "File signature does not match the declared type.", status: 415, retryable: false });
  }
}
