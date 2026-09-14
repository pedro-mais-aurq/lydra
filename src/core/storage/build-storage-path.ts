import { sanitizeFileName } from "@/core/storage/sanitize-filename";

/**
 * Builds the canonical Storage object path (contract section 13):
 *   <ownerId>/<comparisonId>/<documentId>/<sanitizedFileName>
 *
 * The server is the ONLY thing that ever constructs this path. Route
 * handlers must never accept a client-supplied path or use one directly to
 * write to Storage.
 */
export function buildStoragePath(params: {
  ownerId: string;
  comparisonId: string;
  documentId: string;
  fileName: string;
}): string {
  const safeName = sanitizeFileName(params.fileName);
  return `${params.ownerId}/${params.comparisonId}/${params.documentId}/${safeName}`;
}
