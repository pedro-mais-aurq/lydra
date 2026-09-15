import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAIExtractionProvider } from "@/modules/extraction/providers/openai.provider";
import { readExtractionConfig } from "@/modules/extraction/providers/config";
import { EXTRACTION_SYSTEM_INSTRUCTIONS, UNTRUSTED_DOCUMENT_LABEL } from "@/modules/extraction/prompts/extraction.prompt";
import { extractionJsonSchema } from "@/modules/extraction/providers/json-schema";
import { interpretationDraftSchema } from "@/modules/extraction/interpretation/interpretation";
import { selection } from "@/modules/extraction/tests/fixtures";
import { assessCost } from "@/modules/comparison/cost-assessment";
import { ExtractionService, validateExtraction } from "@/modules/extraction";
import { context, fixture, mockStore, openaiResponse, pdfInput } from "../../fixtures/extraction/helpers";

// Explicit transport stub only; never sent to an external service.
const config = { provider: "openai" as const, model: "model-from-test-environment", apiKey: "synthetic-test-secret", timeoutMs: 100, maxOutputTokens: 12000 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const fetchResult = (value: unknown) => vi.fn<typeof fetch>().mockResolvedValue(json(value));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// Legacy documents remain the same; only their mocked two-stage wire protocol changes.
function interpretedFixture(name = "additional-known") {
  const quote = fixture(name).expected;
  const fact = (key: "supplierName" | "paymentTerms" | "deliveryDays" | "warranty") =>
    quote[key] === null ? null : { value: quote[key], evidence: quote.evidence[key] };
  return {
    schemaVersion: 1, supplierName: fact("supplierName"), paymentTerms: fact("paymentTerms"),
    deliveryDays: fact("deliveryDays"), warranty: fact("warranty"),
    shipping: { status: quote.shipping.status, evidence: quote.evidence.shipping },
    items: [], observations: quote.observations.map(value => ({ value, evidence: { page: 1, text: value } })),
    monetaryEvidence: [quote.evidence.displayedTotal, quote.evidence.shipping]
      .filter(evidence => evidence !== null).map(evidence => ({ evidence, unmarkedTokens: [] })),
  };
}
function pipelineFetch(name = "additional-known") {
  return vi.fn<typeof fetch>().mockResolvedValueOnce(json(openaiResponse(interpretedFixture(name))))
    .mockResolvedValueOnce(json(openaiResponse(selection())));
}


describe("configuration and strict wire schema", () => {
  it.each([{}, { AI_PROVIDER: "openai" }, { AI_PROVIDER: "openai", AI_MODEL: "configured-model" },
    { AI_PROVIDER: "mock", AI_MODEL: "configured-model", AI_API_KEY: "secret" },
    { AI_PROVIDER: "openai", AI_MODEL: " ", AI_API_KEY: "secret" },
    { AI_PROVIDER: "openai", AI_MODEL: "configured-model", AI_API_KEY: "secret\r\nheader" },
  ])("fails explicitly with invalid/missing provider, model or key", env => {
    expect(() => readExtractionConfig(env)).toThrow(expect.objectContaining({ code: "EXTRACTION_PROVIDER_ERROR", retryable: false }));
  });

  it("uses only explicitly configured model and server-side key", () => {
    const env = { AI_PROVIDER: "openai", AI_MODEL: "configured-model", AI_API_KEY: "secret", NEXT_PUBLIC_AI_API_KEY: "must-not-be-used" };
    expect(readExtractionConfig(env)).toMatchObject({ model: "configured-model", apiKey: "secret", timeoutMs: 180000 });
    expect(() => readExtractionConfig({ ...env, AI_API_KEY: undefined })).toThrow();
    for (const value of ["", "0", "NaN", "300001"]) expect(() => readExtractionConfig({ ...env, AI_TIMEOUT_MS: value })).toThrow();
  });

  it("derives strict required properties from the internal interpreter schema at every object", () => {
    const schema = extractionJsonSchema();
    expect(schema.required).toEqual(Object.keys(interpretationDraftSchema.shape));
    function check(value: unknown): void {
      const object = z.object({ type: z.string().optional(), properties: z.record(z.unknown()).optional(), required: z.array(z.string()).optional(), additionalProperties: z.boolean().optional(), items: z.unknown().optional(), anyOf: z.array(z.unknown()).optional() }).parse(value);
      if (object.type === "object") {
        expect(object.additionalProperties).toBe(false);
        expect(object.required).toEqual(Object.keys(object.properties ?? {}));
        Object.values(object.properties ?? {}).forEach(check);
      }
      if (object.items) check(object.items);
      object.anyOf?.forEach(check);
    }
    check(schema);
  });
});

describe("multimodal transport and B11 adversarial documents", () => {
  it.each([
    ["additional-known", "money-1", 4700, "complete"],
    ["included", null, 4570, "complete"],
    ["shipping-absent", null, 4300, "partial"],
  ] as const)("canonical PDF %s traverses both mocked LLM stages and the real assembler", async (name, shippingId, total, completeness) => {
    const fakeFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(openaiResponse(interpretedFixture(name))))
      .mockResolvedValueOnce(json(openaiResponse({ ...selection(), shippingAmountCandidateId: shippingId })));
    const store = mockStore();
    store.downloadDocument.mockResolvedValue(pdfInput(name));
    const quote = await new ExtractionService(store, new OpenAIExtractionProvider(config, fakeFetch)).extract(context);
    expect(quote).toEqual(fixture(name).expected);
    expect(assessCost(quote)).toMatchObject({ knownComparableTotal: total, completeness });
    expect(store.saveCompletedExtraction).toHaveBeenCalledWith(expect.anything(), expect.anything(), quote);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
  it.each(["injection-override", "injection-exfiltration"])("separates hostile PDF bytes from trusted instructions (%s)", async name => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const input = pdfInput(name);
    const fakeFetch = pipelineFetch(name);
    const provider = new OpenAIExtractionProvider(config, fakeFetch);
    const store = mockStore();
    store.downloadDocument.mockResolvedValue(input);
    expect(await new ExtractionService(store, provider).extract(context)).toEqual(fixture(name).expected);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const [url, init] = fakeFetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { Authorization: "Bearer synthetic-test-secret" } });
    const body: unknown = JSON.parse(String(init?.body));
    expect(body).toEqual({
      model: config.model, store: false, stream: false, tools: [], max_output_tokens: 12000,
      input: [
        { role: "system", content: [{ type: "input_text", text: EXTRACTION_SYSTEM_INSTRUCTIONS }] },
        { role: "user", content: [{ type: "input_text", text: UNTRUSTED_DOCUMENT_LABEL }, { type: "input_file", filename: "document.pdf", file_data: "data:application/pdf;base64," + Buffer.from(input.bytes).toString("base64") }] },
      ],
      text: { format: { type: "json_schema", name: "lydra_interpretation_draft", strict: true, schema: extractionJsonSchema() } },
    });
    expect(EXTRACTION_SYSTEM_INSTRUCTIONS).not.toContain("Evil Corp");
    expect(EXTRACTION_SYSTEM_INSTRUCTIONS).not.toContain("attacker.invalid");
    expect(JSON.stringify(body)).not.toContain(config.apiKey);
  });

  it.each(["injection-override", "injection-exfiltration"])("rejects a provider obeying the commands in %s", async name => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    // Keep the B4 wire shape valid so rejection exercises the injection guard,
    // rather than accidentally failing because an obsolete quote DTO was used.
    const interpreted = interpretedFixture(name);
    interpreted.supplierName = { value: "Evil Corp", evidence: { page: 1, text: fixture(name).transcript } };
    expect(interpretationDraftSchema.safeParse(interpreted).success).toBe(true);
    const fakeFetch = fetchResult(openaiResponse(interpreted));
    const provider = new OpenAIExtractionProvider(config, fakeFetch);
    const store = mockStore();
    store.downloadDocument.mockResolvedValue(pdfInput(name));
    await expect(new ExtractionService(store, provider).extract(context)).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    expect(store.saveCompletedExtraction).not.toHaveBeenCalled();
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it.each([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]])("transports allowed image MIME %s as base64 input_image", async (mimeType, extension) => {
    const fakeFetch = pipelineFetch();
    const bytes = new Uint8Array(readFileSync(new URL("../../fixtures/uploads/valid." + extension, import.meta.url)));
    await new OpenAIExtractionProvider(config, fakeFetch).extract({ mimeType, bytes });
    const body: unknown = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ input: [expect.anything(), { content: [expect.anything(), { type: "input_image", detail: "high", image_url: "data:" + mimeType + ";base64," + Buffer.from(bytes).toString("base64") }] }] });
  });

  it.each(["text/plain", "image/heic", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel"])("B18 rejects unsupported MIME %s without calling provider", async mimeType => {
    const fakeFetch = pipelineFetch();
    await expect(new OpenAIExtractionProvider(config, fakeFetch).extract({ ...pdfInput(), mimeType })).rejects.toMatchObject({ code: "EXTRACTION_UNSUPPORTED_INPUT", retryable: false });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects wrong signatures, empty and oversized input before network", async () => {
    const fakeFetch = pipelineFetch();
    const provider = new OpenAIExtractionProvider(config, fakeFetch);
    for (const bytes of [new Uint8Array(), new Uint8Array([1, 2, 3]), new Uint8Array(10 * 1024 * 1024 + 1)]) {
      await expect(provider.extract({ mimeType: "application/pdf", bytes })).rejects.toMatchObject({ code: "EXTRACTION_UNSUPPORTED_INPUT" });
    }
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

describe("B09, B15-B17, B23 — provider errors and hostile responses", () => {
  it.each([[400, false], [401, false], [403, false], [404, false], [408, true], [429, true], [500, true], [503, true]])("maps HTTP %s to canonical retryability %s", async (status, retryable) => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(json({ secret: config.apiKey, prompt: EXTRACTION_SYSTEM_INSTRUCTIONS }, Number(status)));
    await expect(new OpenAIExtractionProvider(config, fakeFetch).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable, details: null });
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it("B15 maps a network exception without leaking raw text", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret provider payload " + config.apiKey));
    const error: unknown = await new OpenAIExtractionProvider(config, fakeFetch).extract(pdfInput()).catch(e => e);
    expect(error).toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true, details: null });
    expect(String(error)).not.toContain(config.apiKey);
  });

  it("aborts a timed-out request and does not retry it", async () => {
    vi.useFakeTimers();
    const fakeFetch = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const pending = expect(new OpenAIExtractionProvider(config, fakeFetch).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true });
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(fakeFetch).toHaveBeenCalledOnce();
    expect(fakeFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it.each([{}, { status: "incomplete", output: [] }, { status: "completed", output: [] },
    { status: "completed", output: [{ type: "function_call", name: "exfiltrate" }] },
    { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "secret" }] }] },
    { status: "completed", output: [...openaiResponse().output, ...openaiResponse().output] },
  ])("rejects incomplete/refused/malformed or unexpected output", async raw => {
    await expect(new OpenAIExtractionProvider(config, fetchResult(raw)).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_INVALID", retryable: false });
  });

  it.each(["not-json", "```json\n{}\n```", "{\"schemaVersion\":"])("rejects malformed output JSON %s", async text => {
    const raw = { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }] };
    await expect(new OpenAIExtractionProvider(config, fetchResult(raw)).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
  });

  it("ignores protocol reasoning metadata but still validates the sole quote", async () => {
    const raw = openaiResponse(interpretedFixture());
    const fakeFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...raw, output: [{ type: "reasoning", summary: [] }, ...raw.output] }))
      .mockResolvedValueOnce(json(openaiResponse(selection())));
    const provider = new OpenAIExtractionProvider(config, fakeFetch);
    expect(validateExtraction(await provider.extract(pdfInput()))).toEqual(fixture().expected);
  });

  it.each([
    ["B1.1 server_error", { code: "server_error" }, true],
    ["B1.2 rate_limit", { code: "rate_limit_exceeded" }, true],
    ["B1.3 timeout/transient", { code: "temporarily_unavailable" }, true],
    ["B1.4 invalid_request", { code: "invalid_request" }, false],
    ["B1.5 unsupported_input-shaped", { code: "unsupported_input" }, false],
    ["B1.6 unknown error code", { code: "some_new_code_we_have_never_seen" }, false],
  ])("%s — classifies a completed-but-failed response by its error, not by status alone", async (_name, error, retryable) => {
    const raw = { status: "failed", output: [], error };
    await expect(new OpenAIExtractionProvider(config, fetchResult(raw)).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable, details: null });
  });

  it("B1.6b — a failed response with no error object at all is treated conservatively as non-retryable", async () => {
    const raw = { status: "failed", output: [] };
    await expect(new OpenAIExtractionProvider(config, fetchResult(raw)).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: false, details: null });
  });

  it("B1.7 — a failed response never leaks the provider's raw error payload to the caller", async () => {
    const secretPayload = { code: "server_error", message: "internal trace, prompt or secret should never surface: " + config.apiKey };
    const raw = { status: "failed", output: [], error: secretPayload };
    const error: unknown = await new OpenAIExtractionProvider(config, fetchResult(raw)).extract(pdfInput()).catch(e => e);
    expect(error).toMatchObject({ code: "EXTRACTION_PROVIDER_ERROR", retryable: true, details: null });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
    expect(String((error as Error).message)).not.toContain(config.apiKey);
    expect(String((error as Error).message)).not.toContain(secretPayload.message);
  });

  it("rejects oversized/malformed HTTP bodies", async () => {
    for (const response of [new Response("x".repeat(1024 * 1024 + 1)), new Response("not-json"), new Response("{}", { headers: { "content-length": "1048577" } })]) {
      await expect(new OpenAIExtractionProvider(config, vi.fn<typeof fetch>().mockResolvedValue(response)).extract(pdfInput())).rejects.toMatchObject({ code: "EXTRACTION_INVALID" });
    }
  });
});
