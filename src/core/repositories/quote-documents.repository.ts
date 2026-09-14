import { extractedQuoteSchema, documentStatusSchema } from "@/contracts";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/core/errors/app-error";
import type { QuoteDocument } from "@/core/domain/types";
import type { AppErrorCode } from "@/contracts";

function validatedExtraction(input: unknown) {
  const parsed = extractedQuoteSchema.safeParse(input);
  if (!parsed.success) throw new AppError({ code: "EXTRACTION_INVALID", message: "Stored extraction does not satisfy the canonical contract.", status: 422, retryable: false });
  return parsed.data;
}

type DocumentScope = { documentId: string; comparisonId: string; ownerId: string };

interface QuoteDocumentRow {
  id: string;
  comparison_id: string;
  owner_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: QuoteDocument["status"];
  extracted_data: QuoteDocument["extractedData"];
  extraction_schema_version: QuoteDocument["extractionSchemaVersion"];
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: QuoteDocumentRow): QuoteDocument {
  return {
    id: row.id,
    comparisonId: row.comparison_id,
    ownerId: row.owner_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: documentStatusSchema.parse(row.status),
    extractedData: row.extracted_data === null ? null : validatedExtraction(row.extracted_data),
    extractionSchemaVersion: row.extraction_schema_version,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Only the operations actually used by the Foundation in this round
 * (contract section 22). No speculative CRUD for B/C/D/E.
 */
export class QuoteDocumentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async countForComparison(comparisonId: string, ownerId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("quote_documents")
      .select("id", { count: "exact", head: true })
      .eq("comparison_id", comparisonId)
      .eq("owner_id", ownerId);

    if (error || count === null) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to count documents.",
        status: 500,
        retryable: true,
      });
    }

    return count;
  }

  /**
   * Inserts the document row. The authoritative "max 4 documents" guard is
   * the DB trigger (migration 0008), which is safe under concurrency; this
   * method translates that trigger's rejection into the canonical
   * TOO_MANY_DOCUMENTS AppError instead of letting a raw Postgres error leak.
   */
  async create(params: {
    id: string;
    comparisonId: string;
    ownerId: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<QuoteDocument> {
    const { data, error } = await this.supabase
      .from("quote_documents")
      .insert({
        id: params.id,
        comparison_id: params.comparisonId,
        owner_id: params.ownerId,
        file_name: params.fileName,
        storage_path: params.storagePath,
        mime_type: params.mimeType,
        size_bytes: params.sizeBytes,
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes("TOO_MANY_DOCUMENTS")) {
        throw new AppError({
          code: "TOO_MANY_DOCUMENTS",
          message: "This comparison already has the maximum of 4 documents.",
          status: 409,
          retryable: false,
        });
      }

      if (error.message.includes("INVALID_COMPARISON_STATE")) {
        throw new AppError({ code: "INVALID_COMPARISON_STATE", message: "Documents can only be uploaded to a draft comparison.", status: 409, retryable: false });
      }

      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to persist document metadata.",
        status: 500,
        retryable: true,
      });
    }

    return toDomain(data as QuoteDocumentRow);
  }

  async listForComparison(comparisonId: string, ownerId: string): Promise<QuoteDocument[]> {
    const { data, error } = await this.supabase
      .from("quote_documents")
      .select()
      .eq("comparison_id", comparisonId)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to list documents.",
        status: 500,
        retryable: true,
      });
    }

    return (data as QuoteDocumentRow[]).map(toDomain);
  }

  async markProcessing(params: DocumentScope): Promise<QuoteDocument> {
    const { data, error } = await this.supabase.from("quote_documents")
      .update({ status: "processing", extracted_data: null, extraction_schema_version: null, error_code: null })
      .eq("id", params.documentId).eq("comparison_id", params.comparisonId).eq("owner_id", params.ownerId)
      .in("status", ["uploaded", "failed"]).select().maybeSingle();
    if (error) throw new AppError({ code: "INTERNAL_ERROR", message: "Failed to start document extraction.", status: 500, retryable: true });
    if (!data) throw new AppError({ code: "INVALID_COMPARISON_STATE", message: "Document is not available for extraction.", status: 409, retryable: false });
    return toDomain(data as QuoteDocumentRow);
  }

  async completeExtraction(params: DocumentScope & { updatedAt: string; extraction: unknown }): Promise<QuoteDocument> {
    const quote = validatedExtraction(params.extraction);
    const { data, error } = await this.supabase.from("quote_documents")
      .update({ status: "completed", extracted_data: quote, extraction_schema_version: 1, error_code: null })
      .eq("id", params.documentId).eq("comparison_id", params.comparisonId).eq("owner_id", params.ownerId)
      .eq("status", "processing").eq("updated_at", params.updatedAt).select().maybeSingle();
    if (error) throw new AppError({ code: "INTERNAL_ERROR", message: "Failed to persist validated extraction.", status: 500, retryable: true });
    if (!data) throw new AppError({ code: "INVALID_COMPARISON_STATE", message: "Document extraction attempt is no longer current.", status: 409, retryable: false });
    return toDomain(data as QuoteDocumentRow);
  }

  async markFailed(params: DocumentScope & { updatedAt: string; errorCode: AppErrorCode }): Promise<void> {
    const { data, error } = await this.supabase.from("quote_documents")
      .update({ status: "failed", extracted_data: null, extraction_schema_version: null, error_code: params.errorCode })
      .eq("id", params.documentId).eq("comparison_id", params.comparisonId).eq("owner_id", params.ownerId)
      .eq("status", "processing").eq("updated_at", params.updatedAt).select("id").maybeSingle();
    if (error) throw new AppError({ code: "INTERNAL_ERROR", message: "Failed to persist document failure.", status: 500, retryable: true });
    if (!data) throw new AppError({ code: "INVALID_COMPARISON_STATE", message: "Document extraction attempt is no longer current.", status: 409, retryable: false });
  }
}
