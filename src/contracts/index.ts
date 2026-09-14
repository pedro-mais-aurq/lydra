/** Shared contract v1.1. No extraction, arithmetic or state transitions here. */
export type ComparisonStatus = "draft" | "processing" | "completed" | "failed";
export type DocumentStatus = "uploaded" | "processing" | "completed" | "failed";
export type EvidenceRef = { page: number | null; text: string };
export type ShippingStatus = "included" | "additional" | "not_informed" | "not_applicable" | "unclear";

export type ExtractedItem = {
  rawDescription: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  evidence: EvidenceRef;
};

export type ExtractedQuote = {
  schemaVersion: 1;
  supplierName: string | null;
  displayedTotal: number | null;
  currency: "BRL" | "UNKNOWN";
  shipping: { status: ShippingStatus; amount: number | null };
  paymentTerms: string | null;
  deliveryDays: number | null;
  warranty: string | null;
  items: ExtractedItem[];
  observations: string[];
  missingFields: string[];
  evidence: {
    supplierName: EvidenceRef | null;
    displayedTotal: EvidenceRef | null;
    shipping: EvidenceRef | null;
    paymentTerms: EvidenceRef | null;
    deliveryDays: EvidenceRef | null;
    warranty: EvidenceRef | null;
  };
};

export type CostAssessment = {
  displayedTotal: number | null;
  knownComparableTotal: number | null;
  completeness: "complete" | "partial" | "unknown";
  reasons: string[];
};

/** A.2 integrator closure: structural output only; no comparison algorithm. */
export type SupplierComparison = {
  documentId: string;
  supplierName: string | null;
  costAssessment: CostAssessment;
  deliveryDays: number | null;
  currency: "BRL" | "UNKNOWN";
  missingFields: string[];
};
export type NormalizedItem = {
  match: "exact" | "probable" | "unmatched";
  entries: { documentId: string; itemIndex: number; item: ExtractedItem }[];
};
export type ComparisonResult = {
  suppliers: SupplierComparison[];
  normalizedItems: NormalizedItem[];
  highlights: {
    lowestCompleteKnownCostDocumentId: string | null;
    lowestKnownCostDocumentId: string | null;
    fastestKnownDeliveryDocumentId: string | null;
    warnings: string[];
  };
  summary: string;
};

export * from "./schemas";

export const ERROR_CODES = [
  "UNAUTHENTICATED", "COMPARISON_NOT_FOUND", "INVALID_COMPARISON_STATE",
  "TOO_FEW_DOCUMENTS", "TOO_MANY_DOCUMENTS", "UNSUPPORTED_FILE_TYPE", "FILE_TOO_LARGE",
  "EXTRACTION_PROVIDER_ERROR", "EXTRACTION_INVALID", "EXTRACTION_UNSUPPORTED_INPUT",
  "COMPARISON_ENGINE_ERROR", "FEEDBACK_INVALID", "VALIDATION_ERROR", "INTERNAL_ERROR",
] as const;
export type AppErrorCode = (typeof ERROR_CODES)[number];
export type ErrorEnvelope = {
  error: { code: AppErrorCode; message: string; retryable: boolean; details: unknown | null };
  requestId: string;
};
