import { AppError } from "@/core/errors/app-error";
import { MAX_FILE_SIZE_BYTES } from "./upload";

// Bound memory even when Content-Length is missing or forged. Allow a small
// multipart envelope around a single file whose own limit stays exactly 10 MiB.
export const MAX_UPLOAD_BODY_BYTES = MAX_FILE_SIZE_BYTES + 64 * 1024;

export async function readUploadForm(request: Request): Promise<FormData> {
  const tooLarge = () => new AppError({ code: "FILE_TOO_LARGE", message: "Upload exceeds the allowed size.", status: 413, retryable: false });
  const invalid = () => new AppError({ code: "VALIDATION_ERROR", message: "Invalid multipart form data.", status: 400, retryable: false });
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BODY_BYTES) throw tooLarge();
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;") || !request.body) throw invalid();
  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* Preserve the size rejection. */ }
        throw tooLarge();
      }
      chunks.push(new Uint8Array(value).buffer);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(new Blob(chunks), { headers: { "content-type": contentType } }).formData();
  } catch {
    throw invalid();
  }
}
