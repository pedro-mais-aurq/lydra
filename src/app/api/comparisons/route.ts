import type { NextRequest } from "next/server";
import { createSupabaseBackendClient } from "@/core/supabase/backend";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { requireOwner } from "@/core/auth/require-owner";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { createComparisonSchema } from "@/core/validation/schemas";
import { AppError } from "@/core/errors/app-error";
import { createRequestId } from "@/core/errors/request-id";
import { respondError, respondOk } from "@/core/errors/respond";
import { serializeComparison } from "@/core/domain/serializers";

export const dynamic = "force-dynamic";

/**
 * POST /api/comparisons - creates a comparison owned by the authenticated
 * session. Never accepts an owner from the request body (createComparisonSchema
 * strips unknown fields, so a client-sent owner_id is discarded before it
 * ever reaches this handler). Always created in status "draft"; never
 * produces a result.
 */
export async function POST(request: NextRequest) {
  const requestId = createRequestId();

  try {
    const session = await createSupabaseServerClient();
    const { ownerId } = await requireOwner(session);
    const supabase = createSupabaseBackendClient();

    const json = await request.json().catch(() => null);
    const parsed = createComparisonSchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid request body.",
        status: 400,
        retryable: false,
        details: parsed.error.flatten(),
      });
    }

    const repo = new ComparisonRepository(supabase);
    const comparison = await repo.create({
      ownerId,
      title: parsed.data.title,
    });

    return respondOk(serializeComparison(comparison), requestId, 201);
  } catch (error) {
    return respondError(error, requestId, "comparisons.create");
  }
}

/**
 * GET /api/comparisons - lists comparisons belonging to the authenticated
 * owner only. Not the Agent E /history endpoint; just the minimal retrieval
 * needed by the Foundation.
 */
export async function GET() {
  const requestId = createRequestId();

  try {
    const session = await createSupabaseServerClient();
    const { ownerId } = await requireOwner(session);
    const supabase = createSupabaseBackendClient();

    const repo = new ComparisonRepository(supabase);
    const comparisons = await repo.listByOwner(ownerId);

    return respondOk(comparisons.map(serializeComparison), requestId, 200);
  } catch (error) {
    return respondError(error, requestId, "comparisons.list");
  }
}
