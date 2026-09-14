import "server-only";
import { z } from "zod";
import { AppError } from "@/core/errors/app-error";

const scopeSchema = z.object({ ownerId: z.string().uuid(), comparisonId: z.string().uuid(), documentId: z.string().uuid() }).strict();
const contextSchema = scopeSchema.extend({ requestId: z.string().uuid() }).strict();
export const processingLeaseSchema = z.object({ updatedAt: z.string().datetime({ offset: true }) }).strict();

export function validateScope(input: unknown) {
  const result = scopeSchema.safeParse(input);
  if (!result.success) throw new AppError({ code: "VALIDATION_ERROR", message: "Contexto de extração inválido.", status: 400, retryable: false });
  return result.data;
}

export function validateContext(input: unknown) {
  const result = contextSchema.safeParse(input);
  if (!result.success) throw new AppError({ code: "VALIDATION_ERROR", message: "Contexto de extração inválido.", status: 400, retryable: false });
  return result.data;
}
