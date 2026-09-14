import "server-only";
import { z } from "zod";
import { configurationError } from "../domain/errors";

const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

const nonBlank = z
  .string()
  .min(1)
  .refine(
    value => value === value.trim() && !/[\r\n]/.test(value),
  );

const optionalBaseUrl = z
  .string()
  .url()
  .refine(
    value => value === value.trim() && !/[\r\n]/.test(value),
  )
  .transform(value => value.replace(/\/+$/, ""))
  .optional();

const configurationSchema = z
  .object({
    provider: z.enum(["openai", "openrouter"]),
    model: nonBlank,
    apiKey: nonBlank,
    baseUrl: optionalBaseUrl,
    timeoutMs: z.number().int().min(1).max(300000),
    maxOutputTokens: z.number().int().min(1).max(32768),
  })
  .strict();

export type ExtractionProviderConfig = z.infer<typeof configurationSchema>;

/**
 * Resolves an allow-listed server-side base URL for the selected provider.
 * AI_BASE_URL is accepted for deployment compatibility, but cannot point to
 * an arbitrary host; this prevents accidental document/key exfiltration.
 */
export function providerBaseUrl(
  config: Pick<ExtractionProviderConfig, "provider" | "baseUrl">,
): string {
  const expected = PROVIDER_BASE_URLS[config.provider];
  const configured = config.baseUrl ?? expected;

  if (configured !== expected) {
    throw configurationError();
  }

  return expected;
}

export function validateProviderConfig(
  input: unknown,
): ExtractionProviderConfig {
  const parsed = configurationSchema.safeParse(input);
  if (!parsed.success) throw configurationError();

  providerBaseUrl(parsed.data);
  return parsed.data;
}

export function readExtractionConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ExtractionProviderConfig {
  return validateProviderConfig({
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL,
    timeoutMs:
      env.AI_TIMEOUT_MS === undefined
        ? 60000
        : Number(env.AI_TIMEOUT_MS),
    maxOutputTokens:
      env.AI_MAX_OUTPUT_TOKENS === undefined
        ? 12000
        : Number(env.AI_MAX_OUTPUT_TOKENS),
  });
}
