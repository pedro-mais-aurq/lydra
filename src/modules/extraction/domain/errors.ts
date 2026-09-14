import "server-only";
import { AppError } from "@/core/errors/app-error";

export const invalidExtraction = () => new AppError({ code: "EXTRACTION_INVALID", message: "A extração não atende ao contrato de dados e evidências.", status: 422, retryable: false });
export const unsupportedInput = () => new AppError({ code: "EXTRACTION_UNSUPPORTED_INPUT", message: "Documento incompatível com a extração.", status: 415, retryable: false });
export const providerError = (retryable: boolean) => new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "Não foi possível executar a extração com o provider configurado.", status: 502, retryable });
export const configurationError = () => new AppError({ code: "EXTRACTION_PROVIDER_ERROR", message: "Configuração server-side de extração ausente ou inválida.", status: 500, retryable: false });
export const persistenceError = () => new AppError({ code: "INTERNAL_ERROR", message: "Não foi possível acessar o documento para extração.", status: 500, retryable: true });
export const stateConflict = () => new AppError({ code: "INVALID_COMPARISON_STATE", message: "O documento não está disponível para esta transição de extração.", status: 409, retryable: false });
export const documentNotFound = () => new AppError({ code: "COMPARISON_NOT_FOUND", message: "Documento não encontrado nesta comparação.", status: 404, retryable: false });

/** Rebuild errors across injected boundaries; never forward arbitrary messages/details/causes. */
export function sanitizeProviderError(error: unknown): AppError {
  if (error instanceof AppError) {
    if (error.code === "EXTRACTION_INVALID") return invalidExtraction();
    if (error.code === "EXTRACTION_UNSUPPORTED_INPUT") return unsupportedInput();
    if (error.code === "EXTRACTION_PROVIDER_ERROR") return providerError(error.retryable);
  }
  return providerError(true);
}

export function sanitizeStoreError(error: unknown): AppError {
  if (error instanceof AppError) {
    if (error.code === "COMPARISON_NOT_FOUND") return documentNotFound();
    if (error.code === "INVALID_COMPARISON_STATE") return stateConflict();
    if (error.code === "EXTRACTION_INVALID") return invalidExtraction();
    if (error.code === "EXTRACTION_UNSUPPORTED_INPUT") return unsupportedInput();
  }
  return persistenceError();
}
