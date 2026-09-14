import "server-only";

/** One private document, no URL, conversation, other quote, or user prompt. */
export interface ProviderExtractionInput {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ExtractionProvider {
  extract(input: ProviderExtractionInput): Promise<unknown>;
}
