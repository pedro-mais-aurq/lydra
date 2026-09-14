import { z } from "zod";
import { AppError } from "@/core/errors/app-error";

export const comparisonIdSchema = z.string().uuid();

export function validateComparisonId(value: string): string {
  const parsed = comparisonIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid comparison id.", status: 400, retryable: false });
  }
  return parsed.data;
}

/**
 * Request body schema for POST /api/comparisons.
 *
 * Deliberately does NOT accept owner_id/ownerId/userId in any form - the
 * contract's critical rule (section 7) is that owner is derived exclusively
 * from the session. Zod's default "strip unknown keys" behavior means even
 * if a client sends owner_id, it's silently discarded before it ever reaches
 * application logic.
 */
export const createComparisonSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
});

export type CreateComparisonInput = z.infer<typeof createComparisonSchema>;
