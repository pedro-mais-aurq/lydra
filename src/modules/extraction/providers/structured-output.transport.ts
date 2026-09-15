import "server-only";

import { z } from "zod";

import type { ProviderExtractionInput } from "../domain/extraction-provider";
import {
  invalidExtraction,
  providerError,
} from "../domain/errors";
import {
  providerBaseUrl,
  type ExtractionProviderConfig,
  type StageConfig,
} from "./config";
import type { JsonSchema } from "./json-schema";
import {
  isRetryableProviderFailure,
  classifyHttpProviderFailure,
} from "./provider-failure";

export interface StructuredRequest {
  stage: StageConfig;
  instructions: string;
  userText: string;
  schemaName: string;
  schema: JsonSchema;
  document?: ProviderExtractionInput;
}

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

const openRouterChatEnvelope = z
  .object({
    choices: z
      .array(
        z
          .object({
            finish_reason: z
              .string()
              .nullable()
              .optional(),

            native_finish_reason: z
              .string()
              .nullable()
              .optional(),

            message: z
              .object({
                role: z
                  .string()
                  .optional(),

                content: z
                  .string()
                  .nullable(),

                refusal: z
                  .string()
                  .nullable()
                  .optional(),

                tool_calls: z
                  .array(z.unknown())
                  .nullable()
                  .optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),

    error: z
      .unknown()
      .optional(),
  })
  .passthrough();

/* -------------------------------------------------------------------------- */
/* Bounded response handling                                                  */
/* -------------------------------------------------------------------------- */

function contentLengthExceedsLimit(
  response: Response,
): boolean {
  const value =
    response.headers.get(
      "content-length",
    );

  if (value === null) {
    return false;
  }

  const length =
    Number(value);

  return (
    Number.isFinite(length) &&
    length >
      MAX_RESPONSE_BYTES
  );
}

function invalidProviderOutput(
  reason: string,
): never {
  console.error(
    "[lydra:extraction-provider-validation]",
    {
      reason,
      errorCode:
        "EXTRACTION_INVALID",
    },
  );

  throw invalidExtraction();
}

async function readBoundedJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (
    !response.body ||
    contentLengthExceedsLimit(
      response,
    )
  ) {
    return invalidProviderOutput(
      "provider_response_missing_or_too_large",
    );
  }

  const reader =
    response.body.getReader();

  const abort = () => {
    void reader
      .cancel()
      .catch(() => {
        console.error(
          "[lydra:extraction-provider]",
          {
            reason:
              "response_cleanup_failed",
          },
        );
      });
  };

  signal.addEventListener(
    "abort",
    abort,
    {
      once: true,
    },
  );

  const chunks:
    Uint8Array[] = [];

  let size = 0;

  try {
    for (;;) {
      const part =
        await reader.read();

      if (part.done) {
        break;
      }

      size +=
        part.value.byteLength;

      if (
        size >
        MAX_RESPONSE_BYTES
      ) {
        void reader
          .cancel()
          .catch(() => {
            console.error(
              "[lydra:extraction-provider]",
              {
                reason:
                  "response_cleanup_failed",
              },
            );
          });

        return invalidProviderOutput(
          "provider_response_too_large",
        );
      }

      chunks.push(
        part.value,
      );
    }
  } finally {
    signal.removeEventListener(
      "abort",
      abort,
    );

    reader.releaseLock();
  }

  try {
    return JSON.parse(
      Buffer
        .concat(chunks)
        .toString("utf8"),
    ) as unknown;
  } catch {
    return invalidProviderOutput(
      "provider_response_json_invalid",
    );
  }
}

/**
 * Bounded, best-effort read used only to classify
 * provider HTTP failures.
 *
 * The raw body is never returned to the browser
 * and is never logged here.
 */
async function tryReadJsonLenient(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    if (
      !response.body ||
      contentLengthExceedsLimit(
        response,
      )
    ) {
      return undefined;
    }

    const reader =
      response.body.getReader();

    const abort = () => {
      void reader
        .cancel()
        .catch(() => {
          console.error(
            "[lydra:extraction-provider]",
            {
              reason:
                "response_cleanup_failed",
            },
          );
        });
    };

    signal.addEventListener(
      "abort",
      abort,
      {
        once: true,
      },
    );

    const chunks:
      Uint8Array[] = [];

    let size = 0;

    try {
      for (;;) {
        const part =
          await reader.read();

        if (part.done) {
          break;
        }

        size +=
          part.value.byteLength;

        if (
          size >
          MAX_RESPONSE_BYTES
        ) {
          void reader
            .cancel()
            .catch(() => {
              console.error(
                "[lydra:extraction-provider]",
                {
                  reason:
                    "response_cleanup_failed",
                },
              );
            });

          return undefined;
        }

        chunks.push(
          part.value,
        );
      }
    } finally {
      signal.removeEventListener(
        "abort",
        abort,
      );

      reader.releaseLock();
    }

    return JSON.parse(
      Buffer
        .concat(chunks)
        .toString("utf8"),
    ) as unknown;
  } catch {
    /*
     * Error-body parsing is advisory only.
     *
     * HTTP status remains authoritative;
     * malformed diagnostics never become
     * extraction data or get logged.
     */
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Provider-specific transport                                                */
/* -------------------------------------------------------------------------- */

function resolveProviderEndpoint(
  config:
    ExtractionProviderConfig,
): string {
  const baseUrl =
    providerBaseUrl(config);

  switch (config.provider) {
    case "openai":
      return `${baseUrl}/responses`;

    case "openrouter":
      return `${baseUrl}/chat/completions`;
  }
}

function toDataUrl(
  input:
    ProviderExtractionInput,
): string {
  return (
    `data:${input.mimeType};base64,` +
    Buffer
      .from(input.bytes)
      .toString("base64")
  );
}

/**
 * Existing provider-specific multimodal formats,
 * shared by both stages.
 *
 * The classifier supplies text only and never gets
 * a file or parser plugin.
 */
function buildProviderBody(
  request: StructuredRequest,
  config:
    ExtractionProviderConfig,
): unknown {
  const {
    document,
    stage,
    instructions,
    userText,
    schemaName,
    schema,
  } = request;

  const dataUrl =
    document
      ? toDataUrl(document)
      : null;

  /* ---------------------------------------------------------------------- */
  /* OpenAI                                                                 */
  /* ---------------------------------------------------------------------- */

  if (
    config.provider ===
    "openai"
  ) {
    const attachment =
      document
        ? document.mimeType ===
          "application/pdf"
          ? {
              type:
                "input_file",

              filename:
                "document.pdf",

              file_data:
                dataUrl,
            }
          : {
              type:
                "input_image",

              image_url:
                dataUrl,

              detail:
                "high",
            }
        : null;

    return {
      model:
        stage.model,

      store:
        false,

      stream:
        false,

      tools:
        [],

      max_output_tokens:
        stage.maxOutputTokens,

      input: [
        {
          role:
            "system",

          content: [
            {
              type:
                "input_text",

              text:
                instructions,
            },
          ],
        },

        {
          role:
            "user",

          content: [
            {
              type:
                "input_text",

              text:
                userText,
            },

            ...(
              attachment
                ? [
                    attachment,
                  ]
                : []
            ),
          ],
        },
      ],

      text: {
        format: {
          type:
            "json_schema",

          name:
            schemaName,

          strict:
            true,

          schema,
        },
      },
    };
  }

  /* ---------------------------------------------------------------------- */
  /* OpenRouter                                                             */
  /* ---------------------------------------------------------------------- */

  const attachment =
    document
      ? document.mimeType ===
        "application/pdf"
        ? {
            type:
              "file",

            file: {
              filename:
                "document.pdf",

              file_data:
                dataUrl,
            },
          }
        : {
            type:
              "image_url",

            image_url: {
              url:
                dataUrl,
            },
          }
      : null;

  return {
    model:
      stage.model,

    stream:
      false,

    /*
     * Important:
     *
     * Keep max_tokens for the OpenRouter/Nex route.
     * Interpreter and classifier still have independent
     * budgets through StageConfig.
     */
    max_tokens:
      stage.maxOutputTokens,

    /*
     * Do NOT send tools: [] here.
     *
     * With require_parameters=true, unnecessary parameters
     * can eliminate otherwise compatible OpenRouter routes.
     */
    messages: [
      {
        role:
          "system",

        content:
          instructions,
      },

      {
        role:
          "user",

        content: [
          {
            type:
              "text",

            text:
              userText,
          },

          ...(
            attachment
              ? [
                  attachment,
                ]
              : []
          ),
        ],
      },
    ],

    response_format: {
      type:
        "json_schema",

      json_schema: {
        name:
          schemaName,

        strict:
          true,

        schema,
      },
    },

    provider: {
      require_parameters:
        true,
    },

    /*
     * Only PDF interpreter requests need the parser plugin.
     *
     * The classifier has document === undefined and therefore
     * does not receive the plugin.
     */
    ...(
      document?.mimeType ===
      "application/pdf"
        ? {
            plugins: [
              {
                id:
                  "file-parser",

                pdf: {
                  engine:
                    "cloudflare-ai",
                },
              },
            ],
          }
        : {}
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Structured JSON parsing                                                    */
/* -------------------------------------------------------------------------- */

function parseJsonText(
  text: string,
): unknown {
  try {
    return JSON.parse(
      text,
    ) as unknown;
  } catch {
    return invalidProviderOutput(
      "structured_output_json_invalid",
    );
  }
}

/**
 * Protocol parsing only.
 *
 * The returned JSON remains untrusted until B
 * applies the canonical runtime and semantic validators.
 */
function parseOpenAiResponse(
  raw: unknown,
): unknown {
  const envelope =
    openAiResponseEnvelope
      .safeParse(raw);

  if (!envelope.success) {
    return invalidProviderOutput(
      "openai_response_envelope_invalid",
    );
  }

  if (
    envelope.data.status ===
    "failed"
  ) {
    throw providerError(
      isRetryableProviderFailure(
        envelope.data.error,
      ),
    );
  }

  if (
    envelope.data.status !==
    "completed"
  ) {
    return invalidProviderOutput(
      "openai_response_not_completed",
    );
  }

  const outputs =
    envelope.data.output;

  if (!outputs) {
    return invalidProviderOutput(
      "openai_output_missing",
    );
  }

  let result:
    unknown;

  let messageCount =
    0;

  for (
    const output of outputs
  ) {
    const type =
      z
        .object({
          type:
            z.string(),
        })
        .safeParse(
          output,
        );

    if (!type.success) {
      return invalidProviderOutput(
        "openai_output_type_invalid",
      );
    }

    if (
      type.data.type ===
      "reasoning"
    ) {
      continue;
    }

    const message =
      openAiOutputMessage
        .safeParse(
          output,
        );

    if (
      !message.success ||
      ++messageCount !== 1
    ) {
      return invalidProviderOutput(
        "openai_output_message_invalid",
      );
    }

    const content =
      openAiOutputText
        .safeParse(
          message.data
            .content[0],
        );

    if (
      !content.success
    ) {
      return invalidProviderOutput(
        "openai_output_text_invalid",
      );
    }

    result =
      parseJsonText(
        content.data.text,
      );
  }

  if (
    messageCount !== 1 ||
    result === undefined
  ) {
    return invalidProviderOutput(
      "openai_structured_output_missing",
    );
  }

  return result;
}

/**
 * OpenRouter chat/completions structured output
 * is returned as JSON text in:
 *
 * choices[0].message.content
 *
 * It remains untrusted domain data after parsing.
 */
function parseOpenRouterResponse(
  raw: unknown,
): unknown {
  const envelope =
    openRouterChatEnvelope
      .safeParse(raw);

  if (!envelope.success) {
    console.error(
      "[lydra:extraction-provider-validation]",
      {
        reason:
          "openrouter_response_envelope_invalid",

        errorCode:
          "EXTRACTION_INVALID",

        issues:
          envelope.error
            .issues
            .map(
              issue => ({
                path:
                  issue.path
                    .join("."),

                code:
                  issue.code,
              }),
            ),
      },
    );

    throw invalidExtraction();
  }

  if (
    envelope.data.error !==
    undefined
  ) {
    return invalidProviderOutput(
      "openrouter_embedded_error",
    );
  }

  const choice =
    envelope.data
      .choices[0];

  if (!choice) {
    return invalidProviderOutput(
      "openrouter_choice_missing",
    );
  }

  if (
    choice.message.role !==
      undefined &&
    choice.message.role !==
      "assistant"
  ) {
    return invalidProviderOutput(
      "openrouter_message_role_invalid",
    );
  }

  if (
    typeof choice
      .message
      .refusal ===
      "string" &&
    choice.message.refusal
      .trim()
      .length > 0
  ) {
    return invalidProviderOutput(
      "openrouter_model_refusal",
    );
  }

  if (
    Array.isArray(
      choice.message
        .tool_calls,
    ) &&
    choice.message
      .tool_calls
      .length > 0
  ) {
    return invalidProviderOutput(
      "openrouter_unexpected_tool_calls",
    );
  }

  const finishReason =
    choice.finish_reason;

  /*
   * A truncated structured result must never be repaired
   * or partially accepted.
   */
  if (
    finishReason ===
    "length"
  ) {
    return invalidProviderOutput(
      "openrouter_output_truncated",
    );
  }

  if (
    finishReason !==
      undefined &&
    finishReason !==
      null &&
    finishReason !==
      "stop"
  ) {
    return invalidProviderOutput(
      "openrouter_finish_reason_invalid",
    );
  }

  const content =
    choice.message.content;

  if (
    typeof content !==
      "string" ||
    content
      .trim()
      .length === 0
  ) {
    return invalidProviderOutput(
      "openrouter_content_empty",
    );
  }

  return parseJsonText(
    content,
  );
}

function parseProviderResponse(
  raw: unknown,
  provider:
    ExtractionProviderConfig["provider"],
): unknown {
  switch (provider) {
    case "openai":
      return parseOpenAiResponse(
        raw,
      );

    case "openrouter":
      return parseOpenRouterResponse(
        raw,
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One bounded HTTP call with its own controller
 * and timeout.
 *
 * No provider strings, response contents or
 * document contents are logged or propagated.
 */
export class StructuredOutputTransport {
  constructor(
    private readonly config:
      ExtractionProviderConfig,

    private readonly fetchImpl:
      typeof fetch = fetch,
  ) {}

  async request(
    request:
      StructuredRequest,
  ): Promise<unknown> {
    const controller =
      new AbortController();

    let response:
      Response | undefined;

    let timeout:
      ReturnType<
        typeof setTimeout
      > | undefined;

    const work =
      async (): Promise<unknown> => {
        try {
          response =
            await this.fetchImpl(
              resolveProviderEndpoint(
                this.config,
              ),
              {
                method:
                  "POST",

                redirect:
                  "error",

                cache:
                  "no-store",

                signal:
                  controller.signal,

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${this.config.apiKey}`,
                },

                body:
                  JSON.stringify(
                    buildProviderBody(
                      request,
                      this.config,
                    ),
                  ),
              },
            );
        } catch {
          throw providerError(
            true,
          );
        }

        if (
          controller.signal
            .aborted
        ) {
          throw providerError(
            true,
          );
        }

        if (
          !response.ok
        ) {
          const errorBody =
            await tryReadJsonLenient(
              response,
              controller.signal,
            );

          throw providerError(
            classifyHttpProviderFailure(
              response.status,
              errorBody,
            ),
          );
        }

        let raw:
          unknown;

        try {
          raw =
            await readBoundedJson(
              response,
              controller.signal,
            );
        } catch (error) {
          if (
            controller.signal
              .aborted
          ) {
            throw providerError(
              true,
            );
          }

          /*
           * Preserve canonical extraction errors instead
           * of converting them into transport failures.
           */
          if (
            error instanceof Error &&
            error.name ===
              "AppError"
          ) {
            throw error;
          }

          throw providerError(
            true,
          );
        }

        if (
          controller.signal
            .aborted
        ) {
          throw providerError(
            true,
          );
        }

        return parseProviderResponse(
          raw,
          this.config
            .provider,
        );
      };

    /*
     * Covers headers AND streamed response bodies,
     * even if an injected fetch implementation does
     * not react to AbortSignal during body consumption.
     */
    const deadline =
      new Promise<never>(
        (
          _resolve,
          reject,
        ) => {
          timeout =
            setTimeout(
              () => {
                controller.abort();

                reject(
                  providerError(
                    true,
                  ),
                );
              },
              request.stage
                .timeoutMs,
            );
        },
      );

    try {
      return await Promise.race([
        work(),
        deadline,
      ]);
    } finally {
      if (
        timeout !==
        undefined
      ) {
        clearTimeout(
          timeout,
        );
      }
    }
  }
}