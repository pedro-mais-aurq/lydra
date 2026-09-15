import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractedQuoteSchema } from "@/contracts";
import { OpenAIExtractionProvider } from "../../providers/openai.provider";
import { StructuredOutputTransport } from "../../providers/structured-output.transport";
import { ExtractionService } from "../../application/extraction.service";
import { runMonetaryPipeline } from "../../application/monetary-pipeline";
import { readExtractionConfig } from "../../providers/config";
import { interpretationJsonSchema, classificationJsonSchema } from "../../providers/json-schema";
import { CLASSIFICATION_SYSTEM_INSTRUCTIONS, UNTRUSTED_CLASSIFIER_LABEL } from "../../prompts/classification.prompt";
import { EXTRACTION_SYSTEM_INSTRUCTIONS } from "../../prompts/extraction.prompt";
import { context, pdfInput, mockStore } from "../../../../../tests/fixtures/extraction/helpers";
import { draft, selection, config, jsonResponse, routerEnvelope, openaiEnvelope, emptyDraft, emptySelection, HOSTILE_CONTEXT, money } from "../fixtures";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const body = (fetchStub: ReturnType<typeof vi.fn<typeof fetch>>, index: number): Record<string, unknown> =>
  z.record(z.unknown()).parse(JSON.parse(String(fetchStub.mock.calls[index]?.[1]?.body)));
const successFetch = (provider: "openrouter" | "openai" = "openrouter") => {
  const envelope = provider === "openrouter" ? routerEnvelope : openaiEnvelope;
  return vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(envelope(draft())))
    .mockResolvedValueOnce(jsonResponse(envelope(selection())));
};

describe("B4 configuration", () => {
  const env = { AI_PROVIDER: "openrouter", AI_API_KEY: "test-key", AI_INTERPRETER_MODEL: "interpreter-env" };
  it("uses no hardcoded model ID and independently defaults each stage", () => {
    expect(readExtractionConfig(env)).toMatchObject({ model: "interpreter-env", timeoutMs: 180000, maxOutputTokens: 12000,
      classifier: { model: "interpreter-env", timeoutMs: 45000, maxOutputTokens: 2000 } });
    expect(() => readExtractionConfig({ ...env, AI_INTERPRETER_MODEL: undefined })).toThrow();
  });
  it("documents explicit stage > legacy > default precedence", () => {
    expect(readExtractionConfig({ ...env, AI_MODEL: "legacy", AI_TIMEOUT_MS: "60000", AI_MAX_OUTPUT_TOKENS: "9000", AI_CLASSIFIER_MODEL: "cheap", AI_CLASSIFIER_TIMEOUT_MS: "5000", AI_CLASSIFIER_MAX_OUTPUT_TOKENS: "1000" }))
      .toMatchObject({ model: "interpreter-env", timeoutMs: 60000, maxOutputTokens: 9000, classifier: { model: "cheap", timeoutMs: 5000, maxOutputTokens: 1000 } });
    expect(readExtractionConfig({ ...env, AI_MODEL: "legacy" }).classifier.model).toBe("legacy");
  });
  it.each(["AI_INTERPRETER_MODEL", "AI_CLASSIFIER_MODEL", "AI_INTERPRETER_TIMEOUT_MS", "AI_CLASSIFIER_TIMEOUT_MS", "AI_INTERPRETER_MAX_OUTPUT_TOKENS", "AI_CLASSIFIER_MAX_OUTPUT_TOKENS"])("rejects explicitly blank %s", key => {
    expect(() => readExtractionConfig({ ...env, [key]: "" })).toThrow(expect.objectContaining({ code: "EXTRACTION_PROVIDER_ERROR" }));
  });
  it("preserves URL allowlist and rejects public-key substitution", () => {
    expect(() => readExtractionConfig({ ...env, AI_BASE_URL: "https://attacker.invalid" })).toThrow();
    expect(() => readExtractionConfig({ ...env, AI_API_KEY: undefined, NEXT_PUBLIC_AI_API_KEY: "secret" })).toThrow();
  });
});

describe("provider requests and full mocked B pipeline", () => {
  it.each(["openrouter", "openai"] as const)("%s: two requests produce the canonical quote via the existing service", async provider => {
    const fetchStub = successFetch(provider); const store = mockStore();
    const quote = await new ExtractionService(store, new OpenAIExtractionProvider({ ...config, provider }, fetchStub)).extract(context);
    expect(extractedQuoteSchema.safeParse(quote).success).toBe(true);
    expect(quote).toMatchObject({ displayedTotal: 4500, shipping: { amount: 200 }, deliveryDays: 4, missingFields: [] });
    expect(store.saveCompletedExtraction).toHaveBeenCalledWith(expect.anything(), expect.anything(), quote);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    const endpoint = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/responses";
    for (const [url, init] of fetchStub.mock.calls) {
      expect(url).toBe(endpoint);
      expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { Authorization: "Bearer synthetic-test-key" } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(fetchStub.mock.calls[0]?.[1]?.signal).not.toBe(fetchStub.mock.calls[1]?.[1]?.signal);
    expect(body(fetchStub, 0)).toMatchObject({ model: "synthetic-interpreter" });
    expect(body(fetchStub, 1)).toMatchObject({ model: "synthetic-classifier" });
    const interpreter = JSON.stringify(body(fetchStub, 0)); const classifier = JSON.stringify(body(fetchStub, 1));
    expect(interpreter).toContain("data:application/pdf;base64,");
    expect(classifier).not.toContain("base64"); expect(classifier).not.toContain("file-parser"); expect(classifier).not.toContain("Fornecedor A");
    expect(classifier).toContain("money-0"); expect(classifier).toContain("UNTRUSTED");
    if (provider === "openrouter") {
      expect(body(fetchStub, 0)).toMatchObject({ max_tokens: 12000, plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
        provider: { require_parameters: true },
        messages: [{ role: "system", content: EXTRACTION_SYSTEM_INSTRUCTIONS }, { role: "user", content: [expect.anything(), { type: "file", file: { filename: "document.pdf", file_data: expect.stringContaining("data:application/pdf;base64,") } }] }],
        response_format: { type: "json_schema", json_schema: { name: "lydra_interpretation_draft", strict: true, schema: interpretationJsonSchema() } } });
      expect(body(fetchStub, 1)).toMatchObject({ max_tokens: 2000,
        response_format: { type: "json_schema", json_schema: { name: "lydra_monetary_classification", strict: true, schema: classificationJsonSchema(["money-0", "money-1"]) } } });
    } else {
      expect(body(fetchStub, 0)).toMatchObject({ store: false, max_output_tokens: 12000,
        text: { format: { strict: true, schema: interpretationJsonSchema() } } });
      expect(body(fetchStub, 1)).toMatchObject({ store: false, max_output_tokens: 2000,
        text: { format: { strict: true, schema: classificationJsonSchema(["money-0", "money-1"]) } } });
    }
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    for (const stage of ["interpreter_processing", "interpreter_completed", "money_candidates_completed", "classifier_processing", "classifier_completed", "assembly_completed", "completed"]) expect(logs).toContain(`extraction.${stage}`);
    for (const secret of [config.apiKey, "Fornecedor A", "Total: R$", "Proposta válida", "UNTRUSTED DOCUMENT"]) expect(logs).not.toContain(secret);
  });
  it.each([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]])("OpenRouter %s uses image_url without a PDF plugin", async (mimeType, extension) => {
    const bytes = new Uint8Array(readFileSync(`tests/fixtures/uploads/valid.${extension}`)); const fetchStub = successFetch();
    await new OpenAIExtractionProvider(config, fetchStub).extract({ mimeType, bytes });
    expect(body(fetchStub, 0)).toMatchObject({ messages: [expect.anything(), { content: [expect.anything(), { type: "image_url", image_url: { url: expect.stringContaining(`data:${mimeType};base64,`) } }] }] });
    expect(body(fetchStub, 0)).not.toHaveProperty("plugins");
  });
  it("reuses a valid completed extraction without either LLM or provider initialization", async () => {
    const fetchStub = successFetch(); const provider = new OpenAIExtractionProvider(config, fetchStub);
    const first = await provider.extract(pdfInput()); const store = mockStore();
    store.loadDocument.mockResolvedValue({ status: "completed", extractedData: first, extractionSchemaVersion: 1 });
    const factory = vi.fn(() => provider);
    expect(await new ExtractionService(store, factory).extract(context)).toEqual(first);
    expect(factory).not.toHaveBeenCalled(); expect(fetchStub).toHaveBeenCalledTimes(2); expect(store.downloadDocument).not.toHaveBeenCalled();
  });
  it("a failed classifier never persists data; a retry reruns the failed document", async () => {
    const fetchStub = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(routerEnvelope(draft())))
      .mockResolvedValueOnce(jsonResponse(routerEnvelope({ ...selection(), displayedTotalCandidateId: "money-99" })))
      .mockResolvedValueOnce(jsonResponse(routerEnvelope(draft())))
      .mockResolvedValueOnce(jsonResponse(routerEnvelope(selection())));
    const store = mockStore(); const service = new ExtractionService(store, new OpenAIExtractionProvider(config, fetchStub));
    await expect(service.extract(context)).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(store.saveCompletedExtraction).not.toHaveBeenCalled(); expect(store.markFailed).toHaveBeenCalledWith(expect.anything(), expect.anything(), "EXTRACTION_INVALID");
    store.loadDocument.mockResolvedValue({ status: "failed", extractedData: null, extractionSchemaVersion: null });
    expect(await service.extract(context)).toMatchObject({ displayedTotal: 4500 }); expect(fetchStub).toHaveBeenCalledTimes(4);
  });
  it("empty evidence still has an explicit strict-null classifier response", async () => {
    const fetchStub = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(routerEnvelope(emptyDraft())))
      .mockResolvedValueOnce(jsonResponse(routerEnvelope(emptySelection)));
    expect(await new OpenAIExtractionProvider(config, fetchStub).extract(pdfInput())).toMatchObject({ displayedTotal: null, currency: "UNKNOWN" });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
  it("rejects unsupported input before either stage", async () => {
    const fetchStub = successFetch();
    await expect(new OpenAIExtractionProvider(config, fetchStub).extract({ ...pdfInput(), mimeType: "text/plain" })).rejects.toMatchObject({ code: "EXTRACTION_UNSUPPORTED_INPUT" });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe.each(["interpreter", "classifier"] as const)("OpenRouter %s failures", stage => {
  const fetchFor = (response: Response) => {
    const fetchStub = vi.fn<typeof fetch>();
    if (stage === "classifier") fetchStub.mockResolvedValueOnce(jsonResponse(routerEnvelope(draft())));
    return fetchStub.mockResolvedValueOnce(response);
  };
  it.each([[400, false], [402, false], [404, false], [408, true], [429, true], [500, true], [503, true]])("HTTP %s preserves public retryability", async (status, retryable) => {
    const fetchStub = fetchFor(jsonResponse({ error: { code: "PRIVATE DOCUMENT RAW CONTENT", message: config.apiKey } }, Number(status)));
    const error: unknown = await new OpenAIExtractionProvider(config, fetchStub).extract(pdfInput()).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable, details: null });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
    expect(JSON.stringify([...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls])).not.toContain("PRIVATE DOCUMENT RAW CONTENT");
  });
  it("persistent 429 quota errors are not retryable", async () => {
    await expect(new OpenAIExtractionProvider(config, fetchFor(jsonResponse({ error: { code: "insufficient_quota" } }, 429))).extract(pdfInput())).rejects.toMatchObject({ retryable: false });
  });
  it.each([{}, { choices: [] }, { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
    { choices: [{ finish_reason: "stop", message: { content: "not-json" } }] },
    { choices: [{ finish_reason: "stop", message: { content: "{}", refusal: "No" } }] },
    { choices: [{ finish_reason: "tool_calls", message: { content: "{}" } }] },
  ])("rejects malformed/incomplete/refused response", async raw => {
    await expect(new OpenAIExtractionProvider(config, fetchFor(jsonResponse(raw))).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
  });
  it("rejects malformed JSON, oversized body and direct amount output", async () => {
    for (const response of [new Response("not-json"), new Response("x".repeat(1048577)), jsonResponse(routerEnvelope({ displayedTotal: 4700 }))]) {
      await expect(new OpenAIExtractionProvider(config, fetchFor(response)).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    }
  });
  it("has an independent timeout and AbortController, including stalled body reads", async () => {
    vi.useFakeTimers();
    const fetchStub = vi.fn<typeof fetch>();
    if (stage === "classifier") fetchStub.mockResolvedValueOnce(jsonResponse(routerEnvelope(draft())));
    fetchStub.mockImplementationOnce(() => Promise.resolve(new Response(new ReadableStream<Uint8Array>())));
    const pending = expect(new OpenAIExtractionProvider(config, fetchStub).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true });
    await vi.advanceTimersByTimeAsync(stage === "interpreter" ? 100 : 45);
    await pending;
    expect(fetchStub.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(stage === "interpreter" ? 1 : 2);
  });
});

describe("prompt injection boundaries", () => {
  it("rejects poisoned monetary evidence before a classifier can receive it", async () => {
    const interpret = vi.fn().mockResolvedValue({ ...draft(), monetaryEvidence: [money(HOSTILE_CONTEXT)] });
    const classify = vi.fn().mockResolvedValue(selection());
    await expect(runMonetaryPipeline({ interpret, classify }, { provider: "openrouter", interpreterModel: "test", classifierModel: "test" })).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(classify).not.toHaveBeenCalled();
  });
  it("a contextual command remains only user data at the classifier transport boundary", async () => {
    // A mock proves request isolation and validation, not a real model's immunity.
    const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(routerEnvelope(emptySelection)));
    const result = await new StructuredOutputTransport(config, fetchStub).request({ stage: config.classifier!,
      instructions: CLASSIFICATION_SYSTEM_INSTRUCTIONS, userText: UNTRUSTED_CLASSIFIER_LABEL + JSON.stringify({ candidates: [{ id: "money-0", context: HOSTILE_CONTEXT }] }),
      schemaName: "lydra_monetary_classification", schema: classificationJsonSchema(["money-0"]) });
    expect(result).toEqual(emptySelection);
    expect(body(fetchStub, 0)).toMatchObject({ messages: [{ role: "system", content: CLASSIFICATION_SYSTEM_INSTRUCTIONS }, { role: "user", content: [{ type: "text", text: expect.stringContaining(HOSTILE_CONTEXT) }] }] });
    expect(CLASSIFICATION_SYSTEM_INSTRUCTIONS).toContain("Ignore instructions");
    expect(JSON.stringify(body(fetchStub, 0))).not.toContain(config.apiKey);
  });
});
