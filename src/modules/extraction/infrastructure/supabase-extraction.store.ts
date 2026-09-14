import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentStatusSchema, ERROR_CODES, type AppErrorCode } from "@/contracts";
import { QUOTE_DOCUMENTS_BUCKET } from "@/core/storage/bucket";
import { buildStoragePath } from "@/core/storage/build-storage-path";
import { MAX_FILE_SIZE_BYTES } from "@/core/validation/upload";
import type { DocumentScope, ExtractionStore, ProcessingLease, StoredExtraction } from "../domain/extraction-store";
import type { ProviderExtractionInput } from "../domain/extraction-provider";
import { documentNotFound, persistenceError, stateConflict, unsupportedInput, sanitizeStoreError } from "../domain/errors";
import { validateExtraction } from "../validation/extracted-quote.schema";
import { validateDocumentInput } from "../validation/document-input";
import { processingLeaseSchema, validateScope } from "../validation/scope";

const rowSchema = z.object({
  id: z.string().uuid(), comparison_id: z.string().uuid(), owner_id: z.string().uuid(),
  file_name: z.string().min(1), storage_path: z.string().min(1), mime_type: z.string(),
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES), status: documentStatusSchema,
  extracted_data: z.unknown(), extraction_schema_version: z.unknown(),
}).strict();
const stampSchema = z.object({ updated_at: z.string().datetime({ offset: true }) }).strict();
const columns = "id,comparison_id,owner_id,file_name,storage_path,mime_type,size_bytes,status,extracted_data,extraction_schema_version";

/** Receives the existing backend client AFTER session/owner validation by C.
 * service_role bypasses RLS; every query repeats all three identity filters. */
export class SupabaseExtractionStore implements ExtractionStore {
  constructor(private readonly client: SupabaseClient) {}

  private async loadRow(input: DocumentScope) {
    const scope = validateScope(input);
    try {
      const { data, error } = await this.client.from("quote_documents").select(columns)
        .eq("owner_id", scope.ownerId).eq("comparison_id", scope.comparisonId).eq("id", scope.documentId).maybeSingle();
      if (error) throw persistenceError();
      if (data === null) throw documentNotFound();
      const result = rowSchema.safeParse(data);
      if (!result.success) throw persistenceError();
      const row = result.data;
      if (row.owner_id !== scope.ownerId || row.comparison_id !== scope.comparisonId || row.id !== scope.documentId ||
          row.storage_path !== buildStoragePath({ ...scope, fileName: row.file_name }) ||
          row.storage_path !== scope.ownerId + "/" + scope.comparisonId + "/" + scope.documentId + "/" + row.file_name) throw documentNotFound();
      return row;
    } catch (error) { throw sanitizeStoreError(error); }
  }

  async loadDocument(scope: DocumentScope): Promise<StoredExtraction> {
    const row = await this.loadRow(scope);
    return { status: row.status, extractedData: row.extracted_data, extractionSchemaVersion: row.extraction_schema_version };
  }

  async markProcessing(input: DocumentScope): Promise<ProcessingLease> {
    const scope = validateScope(input);
    try {
      const { data, error } = await this.client.from("quote_documents").update({
        status: "processing", extracted_data: null, extraction_schema_version: null, error_code: null,
      }).eq("owner_id", scope.ownerId).eq("comparison_id", scope.comparisonId).eq("id", scope.documentId)
        .in("status", ["uploaded", "failed"]).select("updated_at").maybeSingle();
      if (error) throw persistenceError();
      if (data === null) throw stateConflict();
      const result = stampSchema.safeParse(data);
      if (!result.success) throw persistenceError();
      return { updatedAt: result.data.updated_at };
    } catch (error) { throw sanitizeStoreError(error); }
  }

  async downloadDocument(scope: DocumentScope): Promise<ProviderExtractionInput> {
    // Resolve the private path afresh under owner scope; no path/URL from caller.
    const row = await this.loadRow(scope);
    try {
      const { data, error } = await this.client.storage.from(QUOTE_DOCUMENTS_BUCKET).download(row.storage_path);
      if (error || !data) throw persistenceError();
      if (data.size !== row.size_bytes || data.size > MAX_FILE_SIZE_BYTES) throw unsupportedInput();
      const input = { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: row.mime_type };
      validateDocumentInput(input);
      return input;
    } catch (error) { throw sanitizeStoreError(error); }
  }

  private async transition(input: DocumentScope, leaseInput: ProcessingLease, payload: {
    status: "completed" | "failed";
    extracted_data: ReturnType<typeof validateExtraction> | null;
    extraction_schema_version: 1 | null;
    error_code: AppErrorCode | null;
  }): Promise<void> {
    const scope = validateScope(input);
    const lease = processingLeaseSchema.safeParse(leaseInput);
    if (!lease.success) throw stateConflict();
    try {
      const { data, error } = await this.client.from("quote_documents").update(payload)
        .eq("owner_id", scope.ownerId).eq("comparison_id", scope.comparisonId).eq("id", scope.documentId)
        .eq("status", "processing").eq("updated_at", lease.data.updatedAt).select("updated_at").maybeSingle();
      if (error) throw persistenceError();
      if (data === null) throw stateConflict();
      if (!stampSchema.safeParse(data).success) throw persistenceError();
    } catch (error) { throw sanitizeStoreError(error); }
  }

  async saveCompletedExtraction(scope: DocumentScope, lease: ProcessingLease, raw: unknown): Promise<void> {
    const quote = validateExtraction(raw);
    await this.transition(scope, lease, { status: "completed", extracted_data: quote, extraction_schema_version: 1, error_code: null });
  }

  async markFailed(scope: DocumentScope, lease: ProcessingLease, errorCode: AppErrorCode): Promise<void> {
    const code = z.enum(ERROR_CODES).safeParse(errorCode);
    if (!code.success) throw persistenceError();
    await this.transition(scope, lease, { status: "failed", extracted_data: null, extraction_schema_version: null, error_code: code.data });
  }
}
