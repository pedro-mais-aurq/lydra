import { validateComparisonId } from "@/core/validation/schemas";
import { createSupabaseBackendClient } from "@/core/supabase/backend";
import { createSupabaseServerClient } from "@/core/supabase/server";
import { requireOwner } from "@/core/auth/require-owner";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { AppError } from "@/core/errors/app-error";
import { createRequestId } from "@/core/errors/request-id";
import { respondError, respondOk } from "@/core/errors/respond";
import {
  serializeComparison,
  serializeQuoteDocument,
} from "@/core/domain/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/comparisons/:id - returns the comparison and its documents, only
 * when it belongs to the authenticated owner.
 *
 * Cross-owner behavior (contract section 12): a comparison that exists but
 * belongs to a different owner returns exactly the same 404
 * COMPARISON_NOT_FOUND as a comparison that doesn't exist at all. This
 * handler never distinguishes the two cases, by construction:
 * findByIdForOwner() itself returns null for both.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();

  try {
    const session = await createSupabaseServerClient();
    const { ownerId } = await requireOwner(session);
    const comparisonId = validateComparisonId((await params).id);
    const supabase = createSupabaseBackendClient();

    const comparisonRepo = new ComparisonRepository(supabase);
    const comparison = await comparisonRepo.findByIdForOwner({
      id: comparisonId,
      ownerId,
    });

    if (!comparison) {
      throw new AppError({
        code: "COMPARISON_NOT_FOUND",
        message: "Comparison not found.",
        status: 404,
        retryable: false,
      });
    }

    const documentRepo = new QuoteDocumentRepository(supabase);
    const documents = await documentRepo.listForComparison(comparison.id, ownerId);

    return respondOk(
      {
        ...serializeComparison(comparison),
        documents: documents.map(serializeQuoteDocument),
      },
      requestId,
      200
    );
  } catch (error) {
    return respondError(error, requestId, "comparisons.detail");
  }
}
