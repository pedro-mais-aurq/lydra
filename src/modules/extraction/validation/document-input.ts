import "server-only";
import { z } from "zod";
import { MAX_FILE_SIZE_BYTES } from "@/core/validation/upload";
import { validateFileSignature } from "@/core/validation/file-signature";
import { unsupportedInput } from "../domain/errors";
import type { ProviderExtractionInput } from "../domain/extraction-provider";

export const extractionMimeSchema = z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function validateDocumentInput(input: ProviderExtractionInput): void {
  if (!extractionMimeSchema.safeParse(input.mimeType).success ||
      !(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 ||
      input.bytes.byteLength > MAX_FILE_SIZE_BYTES) throw unsupportedInput();
  try { validateFileSignature(input.bytes, input.mimeType); }
  catch { throw unsupportedInput(); }
}
