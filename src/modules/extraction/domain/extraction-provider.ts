import "server-only";
import type { ExtractionTrace } from "../application/telemetry";

/** One private document, no URL, conversation, other quote, or user prompt. */
export interface ProviderExtractionInput {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ExtractionProvider {
  extract(input: ProviderExtractionInput, trace?: ExtractionTrace): Promise<unknown>;
}
