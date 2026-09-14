import type { ComparisonStatus, DocumentStatus, ComparisonResult, ExtractedQuote } from "@/contracts";
// Backward-compatible imports only: the shared definitions live in contracts.
export type { ComparisonStatus, DocumentStatus, DocumentStatus as QuoteDocumentStatus } from "@/contracts";

export interface Comparison {
  id: string;
  ownerId: string;
  title: string;
  status: ComparisonStatus;
  result: ComparisonResult | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteDocument {
  id: string;
  comparisonId: string;
  ownerId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  extractedData: ExtractedQuote | null;
  extractionSchemaVersion: ExtractedQuote["schemaVersion"] | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}
