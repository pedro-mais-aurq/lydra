import "server-only";
import { z } from "zod";
import type {
  ExtractionProvider,
  ProviderExtractionInput,
} from "../domain/extraction-provider";
import { invalidExtraction, providerError } from "../domain/errors";
import {
  EXTRACTION_SYSTEM_INSTRUCTIONS,
  UNTRUSTED_DOCUMENT_LABEL,
} from "../prompts/extraction.prompt";
import { validateDocumentInput } from "../validation/document-input";
import { extractionJsonSchema } from "./json-schema";
import {
  providerBaseUrl,
  validateProviderConfig,
  type ExtractionProviderConfig,
} from "./config";
import {
  isRetryableProviderFailure,
  classifyHttpProviderFailure,
} from "./provider-failure";

const MAX_RESPONSE_BYTES = 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* OpenAI Responses API                                                       */
/* -------------------------------------------------------------------------- */

const openAiResponseEnvelope = z.object({
  status: z.string(),
  output: z.array(z.unknown()).optional(),
  error: z.unknown().optional(),
});

const openAiOutputMessage = z.object({
  type: z.literal("message"),
  role: z.literal("assistant"),
  status: z.literal("completed").optional(),
  content: z.array(z.unknown()).length(1),
});

const openAiOutputText = z.object({
  type: z.literal("output_text"),
  text: z.string().min(1),
});

/* -------------------------------------------------------------------------- */
/* OpenRouter Chat Completions API                                            */
/* -------------------------------------------------------------------------- */

const openRouterChatEnvelope = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.literal("assistant").optional(),
          content: z.string().min(1),
        }),
      }),
    )
    .length(1),
});

/* -------------------------------------------------------------------------- */
/* Bounded response handling                                                  */
/* -------------------------------------------------------------------------- */

function contentLengthExceedsLimit(response: Response): boolean {
  const value = response.headers.get("content-length");
  if (value === null) return false;

  const length = Number(value);
  return Number.isFinite(length) && length > MAX_RESPONSE_BYTES;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body || contentLengthExceedsLimit(response)) {
    throw invalidExtraction();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (; ;) {
      const part = await reader.read();
      if (part.done) break;

      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw invalidExtraction();
      }

      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw invalidExtraction();
  }
}

/**
 * Bounded, best-effort read used only to classify provider HTTP failures.
 * The raw body is never returned to the browser and is never logged here.
 */
async function tryReadJsonLenient(response: Response): Promise<unknown> {
  try {
    if (!response.body || contentLengthExceedsLimit(response)) {
      return undefined;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
      for (; ;) {
        const part = await reader.read();
        if (part.done) break;

        size += part.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => undefined);
          return undefined;
        }

        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Provider-specific transport                                                */
/* -------------------------------------------------------------------------- */

function resolveProviderEndpoint(config: ExtractionProviderConfig): string {
  const baseUrl = providerBaseUrl(config);

  switch (config.provider) {
    case "openai":
      return `${baseUrl}/responses`;
    case "openrouter":
      return `${baseUrl}/chat/completions`;
  }
}

function toDataUrl(input: ProviderExtractionInput): string {
  return (
    `data:${input.mimeType};base64,` +
    Buffer.from(input.bytes).toString("base64")
  );
}

function buildOpenAiBody(
  input: ProviderExtractionInput,
  config: ExtractionProviderConfig,
): unknown {
  const dataUrl = toDataUrl(input);

  const document =
    input.mimeType === "application/pdf"
      ? {
        type: "input_file" as const,
        filename: "document.pdf",
        file_data: dataUrl,
      }
      : {
        type: "input_image" as const,
        image_url: dataUrl,
        detail: "high" as const,
      };

  return {
    model: config.model,
    store: false,
    stream: false,
    tools: [],
    max_output_tokens: config.maxOutputTokens,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: EXTRACTION_SYSTEM_INSTRUCTIONS,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: UNTRUSTED_DOCUMENT_LABEL,
          },
          document,
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "lydra_extracted_quote",
        strict: true,
        schema: extractionJsonSchema(),
      },
    },
  };
}

function buildOpenRouterBody(
  input: ProviderExtractionInput,
  config: ExtractionProviderConfig,
): unknown {
  const dataUrl = toDataUrl(input);

  const attachment =
    input.mimeType === "application/pdf"
      ? {
        type: "file" as const,
        file: {
          filename: "document.pdf",
          file_data: dataUrl,
        },
      }
      : {
        type: "image_url" as const,
        image_url: {
          url: dataUrl,
        },
      };

  return {
    model: config.model,
    stream: false,
    max_tokens: config.maxOutputTokens,
    messages: [
      {
        role: "system",
        content: EXTRACTION_SYSTEM_INSTRUCTIONS,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: UNTRUSTED_DOCUMENT_LABEL,
          },
          attachment,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lydra_extracted_quote",
        strict: true,
        schema: extractionJsonSchema(),
      },
    },
    provider: {
      require_parameters: true,
    },
    plugins:
      input.mimeType === "application/pdf"
        ? [
          {
            id: "file-parser",
            pdf: {
              engine: "cloudflare-ai",
            },
          },
        ]
        : undefined,
  };
}

function buildProviderBody(
  input: ProviderExtractionInput,
  config: ExtractionProviderConfig,
): unknown {
  switch (config.provider) {
    case "openai":
      return buildOpenAiBody(input, config);
    case "openrouter":
      return buildOpenRouterBody(input, config);
  }
}

/* -------------------------------------------------------------------------- */
/* Provider-specific parsing                                                  */
/* -------------------------------------------------------------------------- */

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidExtraction();
  }
}

/**
 * Protocol parsing only. The returned JSON remains untrusted until B applies
 * the canonical runtime and semantic extraction validators.
 */
function parseOpenAiResponse(raw: unknown): unknown {
  const envelope = openAiResponseEnvelope.safeParse(raw);
  if (!envelope.success) throw invalidExtraction();

  if (envelope.data.status === "failed") {
    throw providerError(isRetryableProviderFailure(envelope.data.error));
  }

  if (envelope.data.status !== "completed") {
    throw invalidExtraction();
  }

  const outputs = envelope.data.output;
  if (!outputs) throw invalidExtraction();

  let result: unknown;
  let messageCount = 0;

  for (const output of outputs) {
    const type = z.object({ type: z.string() }).safeParse(output);
    if (!type.success) throw invalidExtraction();

    if (type.data.type === "reasoning") continue;

    const message = openAiOutputMessage.safeParse(output);
    if (!message.success || ++messageCount !== 1) {
      throw invalidExtraction();
    }

    const content = openAiOutputText.safeParse(message.data.content[0]);
    if (!content.success) throw invalidExtraction();

    result = parseJsonText(content.data.text);
  }

  if (messageCount !== 1 || result === undefined) {
    throw invalidExtraction();
  }

  return result;
}

/**
 * OpenRouter chat/completions structured output is returned as JSON text in
 * choices[0].message.content. It remains untrusted domain data after parsing.
 */
function parseOpenRouterResponse(raw: unknown): unknown {
  const envelope = openRouterChatEnvelope.safeParse(raw);
  if (!envelope.success) throw invalidExtraction();

  const choice = envelope.data.choices[0];
  if (!choice) throw invalidExtraction();

  return parseJsonText(choice.message.content);
}

function parseProviderResponse(
  raw: unknown,
  provider: ExtractionProviderConfig["provider"],
): unknown {
  switch (provider) {
    case "openai":
      return parseOpenAiResponse(raw);
    case "openrouter":
      return parseOpenRouterResponse(raw);
  }
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Historical class name kept to preserve the existing B3/C wiring.
 *
 * - openai     -> OpenAI Responses API
 * - openrouter -> OpenRouter Chat Completions API
 *
 * Both transports return untrusted JSON which is subsequently validated by
 * the canonical extraction layer.
 */
export class OpenAIExtractionProvider implements ExtractionProvider {
  readonly #config: ExtractionProviderConfig;
  readonly #fetch: typeof fetch;

  constructor(
    config: ExtractionProviderConfig,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.#config = validateProviderConfig(config);
    this.#fetch = fetchImpl;
  }

  async extract(input: ProviderExtractionInput): Promise<unknown> {
    validateDocumentInput(input);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.#config.timeoutMs,
    );

    try {
      const endpoint = resolveProviderEndpoint(this.#config);
      const body = buildProviderBody(input, this.#config);

      let response: Response;

      try {
        response = await this.#fetch(endpoint, {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.#config.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch {
        // Network, DNS and AbortError failures are retryable provider failures.
        // No raw provider/network error crosses this boundary.
        throw providerError(true);
      }
      if (!response.ok) {
        const errorBody = await tryReadJsonLenient(response);

        const safeError = z
          .object({
            error: z
              .object({
                code: z.union([z.string(), z.number()]).optional(),
                type: z.string().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .safeParse(errorBody);

        console.error("[lydra:extraction-provider]", {
          provider: this.#config.provider,
          model: this.#config.model,
          status: response.status,
          errorCode: safeError.success
            ? safeError.data.error?.code ?? null
            : null,
          errorType: safeError.success
            ? safeError.data.error?.type ?? null
            : null,
        });

        throw providerError(
          classifyHttpProviderFailure(
            response.status,
            errorBody,
          ),
        );
      }

      let raw: unknown;

      try {
        raw = await readBoundedJson(response);
      } catch (error) {
        if (controller.signal.aborted) {
          throw providerError(true);
        }

        if (
          error instanceof Error &&
          error.name === "AppError"
        ) {
          throw invalidExtraction();
        }

        throw providerError(true);
      }

      return parseProviderResponse(
        raw,
        this.#config.provider,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}