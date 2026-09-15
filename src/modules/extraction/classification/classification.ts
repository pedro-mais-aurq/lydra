import "server-only";

import { z } from "zod";

import type { InterpretationDraft } from "../interpretation/interpretation";
import type { MonetaryCandidate } from "../monetary/candidates";
import { assertExtraction } from "../validation/assert";

const candidateId = z
  .string()
  .regex(/^money-\d+$/)
  .max(30)
  .nullable();

export const monetaryClassificationSchema = z
  .object({
    displayedTotalCandidateId:
      candidateId,

    shippingAmountCandidateId:
      candidateId,

    items: z
      .array(
        z
          .object({
            itemIndex: z
              .number()
              .int()
              .nonnegative()
              .safe(),

            unitPriceCandidateId:
              candidateId,

            totalPriceCandidateId:
              candidateId,
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export type MonetaryClassification =
  z.infer<
    typeof monetaryClassificationSchema
  >;

export function validateClassification(
  input: unknown,
  candidates:
    readonly MonetaryCandidate[],
  itemCount: number,
): MonetaryClassification {
  const parsed =
    monetaryClassificationSchema.safeParse(
      input,
    );

  assertExtraction(
    parsed.success,
    "classification_schema_invalid",
  );

  const result =
    parsed.data;

  /*
   * Candidate IDs themselves must remain unique.
   *
   * This protects provenance:
   *
   * money-0 = one printed occurrence
   * money-1 = another printed occurrence
   *
   * It does NOT mean that one occurrence may only
   * support one canonical field.
   */
  const ids =
    new Set(
      candidates.map(
        candidate =>
          candidate.id,
      ),
    );

  assertExtraction(
    ids.size ===
      candidates.length,
    "monetary_candidate_duplicate_id",
  );

  /*
   * The classifier must return exactly one
   * classification record per interpreted item.
   */
  assertExtraction(
    result.items.length ===
      itemCount,
    "classification_item_count",
  );

  const indexes =
    new Set<number>();

  for (
    const item of
      result.items
  ) {
    assertExtraction(
      item.itemIndex <
        itemCount &&
        !indexes.has(
          item.itemIndex,
        ),
      "classification_item_index",
    );

    indexes.add(
      item.itemIndex,
    );
  }

  /*
   * Every referenced candidate must exist.
   *
   * Candidate reuse IS allowed.
   *
   * One literal monetary occurrence may legitimately
   * support more than one canonical role when those
   * roles describe the same documentary fact.
   *
   * Examples:
   *
   * - a printed freight charge may be both:
   *     shipping.amount
   *     item.totalPrice
   *
   * - a single-item quote may use one printed amount
   *   as both the item's total and the quote-level total
   *   when that is genuinely the document's meaning.
   *
   * Semantic role assignment belongs to the LLM.
   * Deterministic code validates provenance and
   * financial invariants, not linguistic meaning.
   */
  const references = [
    result
      .displayedTotalCandidateId,

    result
      .shippingAmountCandidateId,

    ...result.items.flatMap(
      item => [
        item
          .unitPriceCandidateId,

        item
          .totalPriceCandidateId,
      ],
    ),
  ];

  for (
    const id of references
  ) {
    if (
      id === null
    ) {
      continue;
    }

    assertExtraction(
      ids.has(id),
      "classification_unknown_candidate",
    );
  }

  return result;
}

/**
 * Untrusted data is serialized into the USER message
 * only, never instructions.
 */
export function classifierContext(
  draft:
    InterpretationDraft,

  candidates:
    readonly MonetaryCandidate[],
): string {
  const context =
    JSON.stringify({
      shippingStatus:
        draft.shipping.status,

      shippingEvidence:
        draft.shipping.evidence,

      items:
        draft.items.map(
          (
            item,
            itemIndex,
          ) => ({
            itemIndex,

            description:
              item.rawDescription,

            evidence:
              item.evidence,
          }),
        ),

      candidates:
        candidates.map(
          candidate => ({
            id:
              candidate.id,

            raw:
              candidate.raw,

            value:
              candidate.value,

            currency:
              candidate.currency,

            page:
              candidate
                .evidence.page,

            context:
              candidate
                .evidence.text,

            tokenStart:
              candidate.start,

            tokenEnd:
              candidate.end,
          }),
        ),
    });

  assertExtraction(
    Buffer.byteLength(
      context,
      "utf8",
    ) <= 64000,
    "classification_context_limit",
  );

  return context;
}