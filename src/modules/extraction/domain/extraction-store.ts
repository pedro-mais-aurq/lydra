import "server-only";
import type { AppErrorCode, DocumentStatus } from "@/contracts";
import type { ProviderExtractionInput } from "./extraction-provider";

/** All IDs must come from the authenticated server-side orchestrator. */
export interface DocumentScope { ownerId: string; comparisonId: string; documentId: string }
export interface ExtractionContext extends DocumentScope { requestId: string }
export interface StoredExtraction {
  status: DocumentStatus;
  extractedData: unknown;
  extractionSchemaVersion: unknown;
}
/** Existing updated_at is a compare-and-set token, never a new DB field. */
export interface ProcessingLease { updatedAt: string }

export interface ExtractionStore {
  loadDocument(scope: DocumentScope): Promise<StoredExtraction>;
  markProcessing(scope: DocumentScope): Promise<ProcessingLease>;
  downloadDocument(scope: DocumentScope): Promise<ProviderExtractionInput>;
  saveCompletedExtraction(scope: DocumentScope, lease: ProcessingLease, extraction: unknown): Promise<void>;
  markFailed(scope: DocumentScope, lease: ProcessingLease, errorCode: AppErrorCode): Promise<void>;
}
