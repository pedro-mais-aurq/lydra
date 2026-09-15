import "server-only";

import type { ExtractedQuote } from "@/contracts";

import { sanitizeProviderError } from "../domain/errors";
import { validateInterpretation } from "../interpretation/interpretation";
import {
  extractMonetaryCandidates,
  type MonetaryCandidate,
} from "../monetary/candidates";
import {
  classifierContext,
  validateClassification,
} from "../classification/classification";
import { assembleExtractedQuote } from "../assembly/assemble-extracted-quote";
import {
  logExtractionStage,
  type ExtractionTrace,
} from "./telemetry";

export interface MonetaryPipelinePort {
  interpret(): Promise<unknown>;

  classify(
    context: string,
    candidates: readonly MonetaryCandidate[],
  ): Promise<unknown>;
}

type FailurePhase =
  | "interpreter"
  | "candidates"
  | "classifier"
  | "assembly";

export async function runMonetaryPipeline(
  port: MonetaryPipelinePort,
  metadata: {
    provider: "openai" | "openrouter";
    interpreterModel: string;
    classifierModel: string;
  },
  trace?: ExtractionTrace,
): Promise<ExtractedQuote> {
  const start = performance.now();

  const elapsed = () =>
    Math.round(performance.now() - start);

  let failurePhase: FailurePhase =
    "interpreter";

  try {
    /*
     * Stage 1 — Interpreter
     */
    failurePhase = "interpreter";

    logExtractionStage(
      "interpreter_processing",
      {
        provider: metadata.provider,
        model: metadata.interpreterModel,
      },
      trace,
    );

    const interpreted =
      await port.interpret();

    const draft =
      validateInterpretation(
        interpreted,
      );

    logExtractionStage(
      "interpreter_completed",
      {
        provider: metadata.provider,
        model: metadata.interpreterModel,
        durationMs: elapsed(),
      },
      trace,
    );

    /*
     * Stage 2 — Deterministic monetary candidate extraction
     */
    failurePhase = "candidates";

    const candidates =
      extractMonetaryCandidates(
        draft.monetaryEvidence,
      );

    logExtractionStage(
      "money_candidates_completed",
      {
        provider: metadata.provider,
        candidateCount:
          candidates.length,
        durationMs: elapsed(),
      },
      trace,
    );

    /*
     * Stage 3 — Monetary classifier
     */
    failurePhase = "classifier";

    const context =
      classifierContext(
        draft,
        candidates,
      );

    logExtractionStage(
      "classifier_processing",
      {
        provider: metadata.provider,
        model: metadata.classifierModel,
        candidateCount:
          candidates.length,
      },
      trace,
    );

    const classified =
      await port.classify(
        context,
        candidates,
      );

    const classification =
      validateClassification(
        classified,
        candidates,
        draft.items.length,
      );

    logExtractionStage(
      "classifier_completed",
      {
        provider: metadata.provider,
        model: metadata.classifierModel,
        durationMs: elapsed(),
      },
      trace,
    );

    /*
     * Stage 4 — Deterministic canonical assembly
     */
    failurePhase = "assembly";

    const quote =
      assembleExtractedQuote(
        draft,
        candidates,
        classification,
      );

    logExtractionStage(
      "assembly_completed",
      {
        provider: metadata.provider,
        durationMs: elapsed(),
      },
      trace,
    );

    return quote;
  } catch (error) {
    const safe =
      sanitizeProviderError(error);

    logExtractionStage(
      "pipeline_failed",
      {
        provider: metadata.provider,
        durationMs: elapsed(),

        failurePhase,

        errorCode:
          safe.code ===
          "EXTRACTION_INVALID"
            ? "EXTRACTION_INVALID"
            : "EXTRACTION_PROVIDER_ERROR",
      },
      trace,
    );

    throw safe;
  }
}