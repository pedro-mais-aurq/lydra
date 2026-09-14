import { AppError } from "@/core/errors/app-error";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_DOCUMENTS_PER_COMPARISON = 4;

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const MIME_TO_EXTENSIONS: Record<AllowedMimeType, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};

function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

function extensionOf(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

/**
 * Validates an incoming upload's declared MIME type, its filename extension
 * coherence, and its size, before anything touches Storage (contract
 * sections 16-17). Content bytes are treated as hostile and are never
 * executed or interpreted in this round.
 */
export function validateUpload(params: {
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}): void {
  if (!isAllowedMimeType(params.mimeType)) {
    throw new AppError({
      code: "UNSUPPORTED_FILE_TYPE",
      message: `MIME type "${params.mimeType}" is not supported.`,
      status: 415,
      retryable: false,
    });
  }

  const ext = extensionOf(params.fileName);
  const expectedExtensions = MIME_TO_EXTENSIONS[params.mimeType];
  if (ext && !expectedExtensions.includes(ext)) {
    throw new AppError({
      code: "UNSUPPORTED_FILE_TYPE",
      message: `File extension ".${ext}" does not match declared MIME type "${params.mimeType}".`,
      status: 415,
      retryable: false,
    });
  }

  if (params.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new AppError({
      code: "FILE_TOO_LARGE",
      message: `File exceeds the ${MAX_FILE_SIZE_BYTES} byte limit.`,
      status: 413,
      retryable: false,
    });
  }

  if (params.sizeBytes <= 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "File is empty.",
      status: 400,
      retryable: false,
    });
  }
}
