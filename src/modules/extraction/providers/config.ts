import "server-only";
import { z } from "zod";
import { configurationError } from "../domain/errors";

const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;
const nonBlank = z.string().min(1).refine(value => value === value.trim() && !/[\r\n]/.test(value));
const stageSchema = z.object({
  model: nonBlank,
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .max(300000),

  maxOutputTokens: z
    .number()
    .int()
    .min(1)
    .max(65536),
}).strict();
const configurationSchema = stageSchema.extend({
  provider: z.enum(["openai", "openrouter"]),
  apiKey: nonBlank,
  baseUrl: z.string().url().refine(value => value === value.trim() && !/[\r\n]/.test(value))
    .transform(value => value.replace(/\/+$/, "")).optional(),
  classifier: stageSchema.optional(),
}).strict();

export type StageConfig = z.infer<typeof stageSchema>;
/** Top-level model/timeout/token fields configure the interpreter. Kept for C's
 * existing constructor wiring; classifier has its own independently resolved settings. */
export type ExtractionProviderConfig = z.infer<typeof configurationSchema>;
export type ResolvedProviderConfig = ExtractionProviderConfig & { classifier: StageConfig };

export function providerBaseUrl(config: Pick<ExtractionProviderConfig, "provider" | "baseUrl">): string {
  const expected = PROVIDER_BASE_URLS[config.provider];
  if ((config.baseUrl ?? expected) !== expected) throw configurationError();
  return expected;
}

export function validateProviderConfig(input: unknown): ResolvedProviderConfig {
  const parsed = configurationSchema.safeParse(input);
  if (!parsed.success) throw configurationError();
  providerBaseUrl(parsed.data);
  return {
    ...parsed.data, classifier: parsed.data.classifier ?? {
      model: parsed.data.model, timeoutMs: 45000, maxOutputTokens: 2000,
    }
  };
}

/** Explicit stage value > legacy AI_* value > stage default.
 * Classifier model falls back to AI_MODEL, then the resolved interpreter model.
 * Empty supplied values are errors, never silently skipped. No model ID default. */
export function readExtractionConfig(env: Readonly<Record<string, string | undefined>> = process.env): ResolvedProviderConfig {
  const interpreterModel = env.AI_INTERPRETER_MODEL ?? env.AI_MODEL;
  return validateProviderConfig({
    provider: env.AI_PROVIDER, model: interpreterModel, apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL,
    timeoutMs: Number(
      env.AI_INTERPRETER_TIMEOUT_MS ??
      env.AI_TIMEOUT_MS ??
      300000
    ),
    maxOutputTokens: Number(
      env.AI_INTERPRETER_MAX_OUTPUT_TOKENS ??
      env.AI_MAX_OUTPUT_TOKENS ??
      32000
    ),
    classifier: {
      model:
        env.AI_CLASSIFIER_MODEL ??
        env.AI_MODEL ??
        interpreterModel,

      timeoutMs: Number(
        env.AI_CLASSIFIER_TIMEOUT_MS ??
        env.AI_TIMEOUT_MS ??
        45000
      ),

      maxOutputTokens: Number(
        env.AI_CLASSIFIER_MAX_OUTPUT_TOKENS ??
        env.AI_MAX_OUTPUT_TOKENS ??
        2000
      ),
    },
  });
}
