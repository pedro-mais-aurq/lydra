import "server-only";

export type ExtractionTrace = {
  requestId: string;
  comparisonId: string;
  documentId: string;
};

export type PipelineStage =
  | "interpreter_processing"
  | "interpreter_completed"
  | "money_candidates_completed"
  | "classifier_processing"
  | "classifier_completed"
  | "assembly_completed"
  | "pipeline_failed";

export type ExtractionFailurePhase =
  | "interpreter"
  | "candidates"
  | "classifier"
  | "assembly";

export interface StageMetadata {
  provider: "openai" | "openrouter";
  model?: string;
  candidateCount?: number;
  durationMs?: number;
  errorCode?:
    | "EXTRACTION_INVALID"
    | "EXTRACTION_PROVIDER_ERROR";

  failurePhase?: ExtractionFailurePhase;
}

/**
 * Explicit serialization:
 * no spreading untrusted provider responses/context.
 */
export function logExtractionStage(
  stage: PipelineStage,
  metadata: StageMetadata,
  trace?: ExtractionTrace,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      stage: `extraction.${stage}`,

      requestId: trace?.requestId,
      comparisonId: trace?.comparisonId,
      documentId: trace?.documentId,

      provider: metadata.provider,
      model: metadata.model,
      candidateCount: metadata.candidateCount,
      durationMs: metadata.durationMs,
      errorCode: metadata.errorCode,

      failurePhase: metadata.failurePhase,
    }),
  );
}