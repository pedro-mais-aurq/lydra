import { createSupabaseServerClient } from "@/core/supabase/server";
import { createSupabaseBackendClient } from "@/core/supabase/backend";
import { requireOwner } from "@/core/auth/require-owner";
import { validateComparisonId } from "@/core/validation/schemas";
import { ComparisonRepository } from "@/core/repositories/comparisons.repository";
import { QuoteDocumentRepository } from "@/core/repositories/quote-documents.repository";
import { createRequestId } from "@/core/errors/request-id";
import { respondError, respondOk } from "@/core/errors/respond";
import { serializeComparison } from "@/core/domain/serializers";
import { processComparison } from "@/modules/comparison/process";
import { createB3ExtractionPort } from "@/modules/comparison/b3-extraction-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId();
  try {
    const session = await createSupabaseServerClient();
    const { ownerId } = await requireOwner(session);
    const comparisonId = validateComparisonId((await params).id);
    const backend = createSupabaseBackendClient();
    const documentRepository = new QuoteDocumentRepository(backend);
    const comparison = await processComparison({
      comparisonId, ownerId, requestId,
      comparisonRepository: new ComparisonRepository(backend), documentRepository,
      extractionPort: createB3ExtractionPort(backend, documentRepository),
    });
    return respondOk(serializeComparison(comparison), requestId);
  } catch (error) { return respondError(error, requestId, "comparisons.process"); }
}
