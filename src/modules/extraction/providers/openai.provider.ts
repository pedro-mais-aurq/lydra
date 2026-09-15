import "server-only";
import type { ExtractionProvider, ProviderExtractionInput } from "../domain/extraction-provider";
import type { ExtractionTrace } from "../application/telemetry";
import { runMonetaryPipeline } from "../application/monetary-pipeline";
import { EXTRACTION_SYSTEM_INSTRUCTIONS, UNTRUSTED_DOCUMENT_LABEL } from "../prompts/extraction.prompt";
import { CLASSIFICATION_SYSTEM_INSTRUCTIONS, UNTRUSTED_CLASSIFIER_LABEL } from "../prompts/classification.prompt";
import { validateDocumentInput } from "../validation/document-input";
import { interpretationJsonSchema, classificationJsonSchema } from "./json-schema";
import { validateProviderConfig, type ExtractionProviderConfig, type ResolvedProviderConfig } from "./config";
import { StructuredOutputTransport } from "./structured-output.transport";

/** Historical name/signature retained to preserve the frozen C adapter.
 * Both OpenAI and OpenRouter execute interpreter -> candidates -> classifier -> assembly. */
export class OpenAIExtractionProvider implements ExtractionProvider {
  readonly #config: ResolvedProviderConfig;
  readonly #transport: StructuredOutputTransport;

  constructor(config: ExtractionProviderConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = validateProviderConfig(config);
    this.#transport = new StructuredOutputTransport(this.#config, fetchImpl);
  }

  async extract(input: ProviderExtractionInput, trace?: ExtractionTrace): Promise<unknown> {
    validateDocumentInput(input);
    return runMonetaryPipeline({
      interpret: () => this.#transport.request({
        stage: this.#config, instructions: EXTRACTION_SYSTEM_INSTRUCTIONS, userText: UNTRUSTED_DOCUMENT_LABEL,
        schemaName: "lydra_interpretation_draft", schema: interpretationJsonSchema(), document: input,
      }),
      classify: (context, candidates) => this.#transport.request({
        stage: this.#config.classifier, instructions: CLASSIFICATION_SYSTEM_INSTRUCTIONS,
        userText: UNTRUSTED_CLASSIFIER_LABEL + context,
        schemaName: "lydra_monetary_classification", schema: classificationJsonSchema(candidates.map(candidate => candidate.id)),
      }),
    }, { provider: this.#config.provider, interpreterModel: this.#config.model, classifierModel: this.#config.classifier.model }, trace);
  }
}
