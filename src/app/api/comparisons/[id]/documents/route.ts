import { sanitizeFileName } from "@/core/storage/sanitize-filename";
import { validateFileSignature } from "@/core/validation/file-signature";
import { readUploadForm } from "@/core/validation/upload-form";
import { validateComparisonId } from "@/core/validation/schemas";
import { randomUUID } from "node:crypto";
import { createSupabaseBackendClient } from "@/core/supabase/backend";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { requireOwner } from "@/core/auth/require-owner";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { validateUpload } from "@/core/validation/upload";
import { buildStoragePath } from "@/core/storage/build-storage-path";
import { QUOTE_DOCUMENTS_BUCKET } from "@/core/storage/bucket";
import { AppError } from "@/core/errors/app-error";
import { createRequestId } from "@/core/errors/request-id";
import { respondError, respondOk } from "@/core/errors/respond";
import { serializeQuoteDocument } from "@/core/domain/serializers";
import { logRequest } from "@/core/errors/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/comparisons/:id/documents
 *
 * Order of operations follows contract section 19 exactly:
 * auth -> load comparison for owner (404 if absent) -> state check ->
 * quantity check -> file validation -> generate documentId -> sanitize name
 * -> build path server-side -> upload to private Storage -> persist
 * quote_documents row -> return safe representation.
 *
 * Failure handling (contract section 19):
 * - If the Storage upload fails, no DB record is created.
 * - If Storage succeeds but the DB insert fails, the just-created Storage
 *   object is deleted best-effort so no orphaned object silently lingers.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();

  try {
    const session = await createSupabaseServerClient();
    const { ownerId } = await requireOwner(session);
    const comparisonId = validateComparisonId((await params).id);
    const supabase = createSupabaseBackendClient();

    const comparisonRepo = new ComparisonRepository(supabase);
    const comparison = await comparisonRepo.findByIdForOwner({
      id: comparisonId,
      ownerId,
    });

    if (!comparison) {
      throw new AppError({
        code: "COMPARISON_NOT_FOUND",
        message: "Comparison not found.",
        status: 404,
        retryable: false,
      });
    }

    if (comparison.status !== "draft") {
      throw new AppError({
        code: "INVALID_COMPARISON_STATE",
        message: `Cannot upload documents while comparison status is "${comparison.status}".`,
        status: 409,
        retryable: false,
      });
    }

    const documentRepo = new QuoteDocumentRepository(supabase);

    // Fast-path rejection to avoid pointless uploads to Storage before
    // hitting the limit; the DB trigger (migration 0008) remains the
    // authoritative, concurrency-safe guard at insert time.
    const currentCount = await documentRepo.countForComparison(comparison.id, ownerId);
    if (currentCount >= 4) {
      throw new AppError({
        code: "TOO_MANY_DOCUMENTS",
        message: "This comparison already has the maximum of 4 documents.",
        status: 409,
        retryable: false,
      });
    }

    const formData = await readUploadForm(request);
    const file = formData?.get("file");

    if (!file || !(file instanceof File)) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: 'Missing "file" field in multipart form data.',
        status: 400,
        retryable: false,
      });
    }

    // Never trust route params, headers, or the file's own claimed name for
    // anything beyond display; validate the declared MIME type and size
    // before doing anything with the bytes (contract section 28).
    validateUpload({
      mimeType: file.type,
      fileName: file.name,
      sizeBytes: file.size,
    });

    const fileName = sanitizeFileName(file.name);
    const fileBuffer = new Uint8Array(await file.arrayBuffer());
    validateFileSignature(fileBuffer, file.type);

    const documentId = randomUUID();
    const storagePath = buildStoragePath({
      ownerId,
      comparisonId: comparison.id,
      documentId,
      fileName,
    });

    const { error: uploadError } = await supabase.storage
      .from(QUOTE_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      logRequest({
        requestId,
        comparisonId: comparison.id,
        documentId,
        stage: "documents.upload.storage_failed",
        errorCode: "STORAGE_UPLOAD_FAILED",
      });

      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to store the uploaded file.",
        status: 500,
        retryable: true,
      });
    }

    try {
      const document = await documentRepo.create({
        id: documentId,
        comparisonId: comparison.id,
        ownerId,
        fileName,
        storagePath,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      return respondOk(serializeQuoteDocument(document), requestId, 201);
    } catch (dbError) {
      // Storage write succeeded but the DB row failed - best-effort cleanup
      // so we never leave a silent inconsistency (contract section 19).
      let cleanupFailed = false;
      try {
        const { error } = await supabase.storage
          .from(QUOTE_DOCUMENTS_BUCKET)
          .remove([storagePath]);
        cleanupFailed = Boolean(error);
      } catch {
        cleanupFailed = true;
      }

      logRequest({
        requestId,
        comparisonId: comparison.id,
        documentId,
        stage: cleanupFailed
          ? "documents.upload.cleanup_failed"
          : "documents.upload.cleanup_ok",
      });

      throw dbError;
    }
  } catch (error) {
    return respondError(error, requestId, "documents.upload");
  }
}
