
import "server-only";

import { z } from "zod";

import { shippingStatusSchema } from "@/contracts";

import { assertExtraction } from "../validation/assert";
import {
  checkEvidence,
  checkObservation,
  supportsNumber,
  supportsText,
} from "../validation/evidence";

export const shortEvidenceSchema = z
  .object({
    page: z
      .number()
      .int()
      .positive()
      .safe()
      .nullable(),

    text: z
      .string()
      .min(1)
      .max(1200),
  })
  .strict();

const textFact = z
  .object({
    value: z
      .string()
      .min(1)
      .max(1200),

    evidence: shortEvidenceSchema,
  })
  .strict();

/**
 * Internal B DTO:
 * transcriptions and semantic facts,
 * never final money values.
 *
 * Unmarked tokens are literal strings
 * identified as potential money by the LLM.
 *
 * They carry no financial role.
 *
 * This avoids parsing quantities as money
 * or reintroducing a dictionary of commercial
 * labels in deterministic code.
 */
export const monetaryEvidenceSchema = z
  .object({
    evidence: shortEvidenceSchema,

    unmarkedTokens: z
      .array(
        z
          .string()
          .min(1)
          .max(64),
      )
      .max(50),
  })
  .strict();

export const interpretationDraftSchema = z
  .object({
    schemaVersion: z.literal(1),

    supplierName:
      textFact.nullable(),

    paymentTerms:
      textFact.nullable(),

    deliveryDays: z
      .object({
        value: z
          .number()
          .int()
          .nonnegative()
          .safe(),

        evidence:
          shortEvidenceSchema,
      })
      .strict()
      .nullable(),

    warranty:
      textFact.nullable(),

    shipping: z
      .object({
        status:
          shippingStatusSchema,

        evidence:
          shortEvidenceSchema.nullable(),
      })
      .strict(),

    items: z
      .array(
        z
          .object({
            rawDescription: z
              .string()
              .min(1)
              .max(1200),

            quantity: z
              .number()
              .finite()
              .nullable(),

            unit: z
              .string()
              .min(1)
              .max(100)
              .nullable(),

            evidence:
              shortEvidenceSchema,
          })
          .strict(),
      )
      .max(500),

    observations: z
      .array(textFact)
      .max(100),

    monetaryEvidence: z
      .array(
        monetaryEvidenceSchema,
      )
      .max(500),
  })
  .strict();

export type InterpretationDraft =
  z.infer<
    typeof interpretationDraftSchema
  >;

export type MonetaryEvidence =
  z.infer<
    typeof monetaryEvidenceSchema
  >;

export function validateInterpretation(
  input: unknown,
): InterpretationDraft {
  const parsed =
    interpretationDraftSchema.safeParse(
      input,
    );

  assertExtraction(
    parsed.success,
    "interpretation_schema_invalid",
  );

  const draft =
    parsed.data;

  /*
   * Textual semantic facts.
   *
   * The code only verifies that the declared value
   * is factually supported by the supplied evidence.
   * It does not reinterpret commercial language.
   */
  for (
    const fact of [
      draft.supplierName,
      draft.paymentTerms,
      draft.warranty,
      ...draft.observations,
    ]
  ) {
    if (fact === null) {
      continue;
    }

    checkEvidence(
      fact.evidence,
    );

    assertExtraction(
      fact.value.trim().length > 0 &&
        supportsText(
          fact.evidence,
          fact.value,
        ),
      "interpretation_text_not_supported",
    );
  }

  /*
   * Delivery semantic interpretation belongs
   * to the LLM.
   *
   * The deterministic layer validates only
   * evidence structure here.
   */
  if (
    draft.deliveryDays !== null
  ) {
    checkEvidence(
      draft.deliveryDays.evidence,
    );
  }

  /*
   * Shipping evidence rules:
   *
   * not_informed:
   *
   * - evidence may be null when shipping is
   *   completely absent from the document;
   *
   * - evidence may exist when the document
   *   explicitly states that shipping information
   *   is not provided.
   *
   * Every other status represents an actual
   * semantic interpretation of documentary
   * content and therefore requires literal
   * evidence.
   *
   * The deterministic layer does NOT attempt
   * to reinterpret words such as "included",
   * "additional", "freight", "transport", etc.
   */
  if (
    draft.shipping.status !==
    "not_informed"
  ) {
    assertExtraction(
      draft.shipping.evidence !==
        null,
      "interpretation_shipping_evidence_missing",
    );
  }

  if (
    draft.shipping.evidence !==
    null
  ) {
    checkEvidence(
      draft.shipping.evidence,
    );
  }

  /*
   * Items.
   */
  for (
    const item of draft.items
  ) {
    checkEvidence(
      item.evidence,
    );

    assertExtraction(
      item.rawDescription
          .trim()
          .length > 0 &&
        supportsText(
          item.evidence,
          item.rawDescription,
        ),
      "interpretation_item_evidence",
    );

    if (
      item.quantity !== null
    ) {
      assertExtraction(
        supportsNumber(
          item.evidence,
          item.quantity,
        ),
        "interpretation_item_quantity",
      );
    }

    if (
      item.unit !== null
    ) {
      assertExtraction(
        item.unit.trim().length >
          0 &&
          supportsText(
            item.evidence,
            item.unit,
          ),
        "interpretation_item_unit",
      );
    }
  }

  /*
   * Observations remain constrained
   * against recommendations, instructions,
   * or unsupported semantic content.
   */
  for (
    const fact of
      draft.observations
  ) {
    checkObservation(
      fact.value,
    );
  }

  /*
   * Monetary evidence is only documentary
   * input for candidate extraction.
   *
   * No monetary role is assigned here.
   */
  for (
    const entry of
      draft.monetaryEvidence
  ) {
    checkEvidence(
      entry.evidence,
    );
  }

  return draft;
}
