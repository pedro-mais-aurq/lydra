import { z } from "zod";
import { comparisonResultSchema, comparisonStatusSchema, documentStatusSchema, extractedQuoteSchema, ERROR_CODES } from "@/contracts";
import type { AppErrorCode } from "@/contracts";
import type { serializeComparison, serializeQuoteDocument } from "@/core/domain/serializers";

export type ComparisonDto = ReturnType<typeof serializeComparison>;
export type DocumentDto = ReturnType<typeof serializeQuoteDocument>;
export type ComparisonDetail = ComparisonDto & { documents: DocumentDto[] };
const comparisonSchema = z.object({
  id: z.string().uuid(), title: z.string(), status: comparisonStatusSchema,
  result: comparisonResultSchema.nullable(), errorCode: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});
const documentSchema = z.object({
  id: z.string().uuid(), comparisonId: z.string().uuid(), fileName: z.string(),
  mimeType: z.string(), sizeBytes: z.number(), status: documentStatusSchema,
  extractedData: extractedQuoteSchema.nullable(), extractionSchemaVersion: z.literal(1).nullable(),
  errorCode: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});
export const detailSchema = comparisonSchema.extend({ documents: z.array(documentSchema) });
const errorSchema = z.object({ error: z.object({ code: z.enum(ERROR_CODES), message: z.string(), retryable: z.boolean(), details: z.unknown().nullable() }), requestId: z.string() });

export class ProductError extends Error {
  constructor(readonly code: AppErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE", readonly retryable: boolean, readonly requestId: string | null = null) {
    super(errorMessage(code));
  }
}
export function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Sua sessão não está disponível. Recarregue a página para tentar novamente.",
    COMPARISON_NOT_FOUND: "Comparação não encontrada ou indisponível nesta sessão.",
    INVALID_COMPARISON_STATE: "O estado da comparação mudou. Consulte o estado atual antes de continuar.",
    TOO_FEW_DOCUMENTS: "Adicione pelo menos 2 documentos antes de analisar.",
    TOO_MANY_DOCUMENTS: "Uma comparação pode ter no máximo 4 documentos.",
    UNSUPPORTED_FILE_TYPE: "Formato não suportado. Use PDF, PNG, JPEG ou WebP.",
    FILE_TOO_LARGE: "O limite é de 10 MiB por documento.",
    EXTRACTION_PROVIDER_ERROR: "Não foi possível concluir a leitura das propostas.",
    EXTRACTION_INVALID: "A leitura não produziu informações verificáveis para concluir a comparação.",
    EXTRACTION_UNSUPPORTED_INPUT: "Um documento não pôde ser lido. Confira o formato e a integridade do arquivo.",
    COMPARISON_ENGINE_ERROR: "Não foi possível comparar as informações extraídas.",
    VALIDATION_ERROR: "Confira o título e os documentos enviados.",
    NETWORK_ERROR: "A resposta não chegou. Consulte o estado antes de repetir a operação.",
    INVALID_RESPONSE: "A resposta recebida não pôde ser validada. Consulte novamente.",
  };
  return messages[code] ?? "Não foi possível concluir a operação. Consulte novamente.";
}
export function asProductError(error: unknown) {
  return error instanceof ProductError ? error : new ProductError("NETWORK_ERROR", false);
}
async function request<T>(url: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" }); }
  catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ProductError("NETWORK_ERROR", false);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success) throw new ProductError(parsed.data.error.code, parsed.data.error.retryable, parsed.data.requestId);
    throw new ProductError("INVALID_RESPONSE", false);
  }
  const envelope = z.object({ data: z.unknown(), requestId: z.string() }).safeParse(body);
  if (!envelope.success) throw new ProductError("INVALID_RESPONSE", false);
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) throw new ProductError("INVALID_RESPONSE", false);
  return parsed.data;
}
export const comparisonApi = {
  create: (title: string): Promise<ComparisonDto> => request("/api/comparisons", comparisonSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }),
  get: (id: string, signal?: AbortSignal): Promise<ComparisonDetail> => request(`/api/comparisons/${encodeURIComponent(id)}`, detailSchema, { signal }),
  upload: (id: string, file: File): Promise<DocumentDto> => {
    const body = new FormData(); body.set("file", file);
    return request(`/api/comparisons/${encodeURIComponent(id)}/documents`, documentSchema, { method: "POST", body });
  },
  process: (id: string): Promise<ComparisonDto> => request(`/api/comparisons/${encodeURIComponent(id)}/process`, comparisonSchema, { method: "POST" }),
};
