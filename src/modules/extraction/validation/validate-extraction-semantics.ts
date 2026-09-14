import "server-only";

import type {
  ExtractedQuote,
  EvidenceRef,
} from "@/contracts";

import { invalidExtraction } from "../domain/errors";

import {
  checkEvidence,
  folded,
  hasInstruction,
  supportsNumber,
  supportsText,
  supportsDisplayedTotal,
  supportsDeliveryDays,
} from "./evidence";

import { expectedMissingFields } from "./missing-fields";

const VALIDATION_LOG_PREFIX = "[lydra:extraction-validation]";

function fail(reason: string): never {
  /*
   * Deliberately log only a reason code.
   *
   * Never log:
   * - document contents
   * - evidence text
   * - extracted quote
   * - supplier data
   * - API/provider responses
   *
   * The public API continues returning only EXTRACTION_INVALID.
   */
  console.error(VALIDATION_LOG_PREFIX, {
    reason,
  });

  throw invalidExtraction();
}

function assert(
  condition: boolean,
  reason: string,
): asserts condition {
  if (!condition) {
    fail(reason);
  }
}

function checkValue(
  value: string | number | null,
  evidence: EvidenceRef | null,
  field: string,
): void {
  if (evidence !== null) {
    /*
     * checkEvidence() continues to be authoritative for evidence sanitation.
     * It currently throws EXTRACTION_INVALID directly, so we pre-check the
     * conditions here only to obtain a useful internal reason code.
     */
    const normalizedEvidence = folded(evidence.text);

    assert(
      normalizedEvidence.length > 0,
      `${field}_evidence_empty`,
    );

    assert(
      normalizedEvidence.length <= 8192,
      `${field}_evidence_too_long`,
    );

    assert(
      !hasInstruction(normalizedEvidence),
      `${field}_evidence_instruction_detected`,
    );

    assert(
      !/^(o documento informa esse valor|valor encontrado|segundo a proposta|the document states this value)[.!]?$/.test(
        normalizedEvidence,
      ),
      `${field}_evidence_generic`,
    );

    assert(
      evidence.page === null ||
        (
          Number.isSafeInteger(evidence.page) &&
          evidence.page >= 1
        ),
      `${field}_evidence_page_invalid`,
    );

    checkEvidence(evidence);
  }

  if (value === null) {
    return;
  }

  assert(
    evidence !== null,
    `${field}_evidence_missing`,
  );

  if (typeof value === "number") {
    assert(
      Number.isFinite(value),
      `${field}_number_invalid`,
    );

    assert(
      supportsNumber(evidence, value),
      `${field}_number_not_supported`,
    );

    return;
  }

  const normalizedValue = folded(value);

  assert(
    normalizedValue.length > 0,
    `${field}_text_empty`,
  );

  assert(
    !/^(n\/a|desconhecido|unknown|nao informado)$/.test(
      normalizedValue,
    ),
    `${field}_placeholder_value`,
  );

  assert(
    supportsText(evidence, value),
    `${field}_text_not_supported`,
  );
}

/**
 * Called only after the strict canonical runtime schema succeeds.
 *
 * Important:
 * - no repairs;
 * - no defaults;
 * - no inferred values;
 * - no fallback to zero;
 * - no semantic weakening.
 *
 * This version only adds safe diagnostic reason codes.
 */
export function validateExtractionSemantics(
  quote: ExtractedQuote,
): void {
  assert(
    quote.schemaVersion === 1,
    "schema_version_invalid",
  );

  for (
    const key of [
      "supplierName",
      "displayedTotal",
      "paymentTerms",
      "deliveryDays",
      "warranty",
    ] as const
  ) {
    checkValue(
      quote[key],
      quote.evidence[key],
      key,
    );
  }

  /*
   * A number merely appearing somewhere in the evidence is insufficient to
   * establish that it is the document-level displayed total.
   */
  if (quote.displayedTotal !== null) {
    assert(
      quote.evidence.displayedTotal !== null,
      "displayed_total_evidence_missing",
    );

    assert(
      supportsDisplayedTotal(
        quote.evidence.displayedTotal,
        quote.displayedTotal,
      ),
      "displayed_total_evidence_not_supported",
    );
  }

  if (quote.deliveryDays !== null) {
    assert(
      quote.deliveryDays >= 0,
      "delivery_days_negative",
    );

    assert(
      quote.evidence.deliveryDays !== null,
      "delivery_days_evidence_missing",
    );

    assert(
      supportsDeliveryDays(
        quote.evidence.deliveryDays,
        quote.deliveryDays,
      ),
      "delivery_days_evidence_not_supported",
    );
  }

  const {
    status,
    amount,
  } = quote.shipping;

  const shippingEvidence = quote.evidence.shipping;

  /*
   * Contract rule:
   *
   * If shipping is genuinely absent from the document, the model must return
   * not_informed + null amount + null evidence.
   */
  if (status === "not_informed") {
    assert(
      amount === null,
      "shipping_not_informed_has_amount",
    );

    assert(
      shippingEvidence === null,
      "shipping_not_informed_has_evidence",
    );
  } else {
    assert(
      shippingEvidence !== null,
      "shipping_evidence_missing",
    );

    const normalizedShippingEvidence =
      folded(shippingEvidence.text);

    assert(
      normalizedShippingEvidence.length > 0,
      "shipping_evidence_empty",
    );

    assert(
      normalizedShippingEvidence.length <= 8192,
      "shipping_evidence_too_long",
    );

    assert(
      !hasInstruction(normalizedShippingEvidence),
      "shipping_evidence_instruction_detected",
    );

    assert(
      shippingEvidence.page === null ||
        (
          Number.isSafeInteger(shippingEvidence.page) &&
          shippingEvidence.page >= 1
        ),
      "shipping_evidence_page_invalid",
    );

    checkEvidence(shippingEvidence);

    const text = normalizedShippingEvidence;

    const shippingMention =
      /\b(frete|shipping|freight|entrega|delivery|transporte)\b/.test(
        text,
      );

    const uncertain =
      /a combinar|sob consulta|consultar|definir posteriormente|to be (agreed|determined)|upon request/.test(
        text,
      );

    const included =
      /\b(inclus[oa]|incluid[oa]|included|gratis|gratuito|gratuita)\b|sem (custo|cobranca)|free shipping/.test(
        text,
      );

    const excluded =
      /nao (inclus|incluid)|not included|cobrad[oa] separadamente|adicional|additional|extra charge|charged separately/.test(
        text,
      );

    if (uncertain) {
      assert(
        status === "unclear",
        "shipping_uncertain_wrong_status",
      );

      assert(
        amount === null,
        "shipping_uncertain_has_amount",
      );
    }

    if (status === "unclear") {
      assert(
        shippingMention,
        "shipping_unclear_without_shipping_mention",
      );

      assert(
        amount === null,
        "shipping_unclear_has_amount",
      );
    }

    if (status === "included") {
      assert(
        shippingMention,
        "shipping_included_without_shipping_mention",
      );

      assert(
        included,
        "shipping_included_without_included_evidence",
      );

      assert(
        !excluded,
        "shipping_included_conflicts_with_excluded",
      );

      assert(
        !uncertain,
        "shipping_included_conflicts_with_uncertainty",
      );
    }

    if (status === "additional") {
      assert(
        shippingMention,
        "shipping_additional_without_shipping_mention",
      );

      assert(
        excluded,
        "shipping_additional_without_additional_evidence",
      );

      assert(
        !uncertain,
        "shipping_additional_conflicts_with_uncertainty",
      );
    }

    if (status === "not_applicable") {
      assert(
        amount === null,
        "shipping_not_applicable_has_amount",
      );

      assert(
        !uncertain,
        "shipping_not_applicable_conflicts_with_uncertainty",
      );

      assert(
        /retirada (no local|pelo cliente)|nao se aplica|not applicable|pickup only|servico (exclusivamente )?digital/.test(
          text,
        ),
        "shipping_not_applicable_not_supported",
      );
    }

    /*
     * Explicit zero is allowed only when the evidence really contains zero.
     *
     * "Frete incluso" alone must never be converted into amount = 0.
     */
    if (amount !== null) {
      assert(
        Number.isFinite(amount),
        "shipping_amount_invalid",
      );

      assert(
        supportsNumber(
          shippingEvidence,
          amount,
        ),
        "shipping_amount_not_supported",
      );
    }
  }

  /*
   * Item validation.
   *
   * Every non-null item field must be literally supported by that item's
   * evidence.
   */
  for (
    const [index, item] of quote.items.entries()
  ) {
    const fieldPrefix = `items[${index}]`;

    const evidenceText = folded(item.evidence.text);

    assert(
      evidenceText.length > 0,
      `${fieldPrefix}_evidence_empty`,
    );

    assert(
      evidenceText.length <= 8192,
      `${fieldPrefix}_evidence_too_long`,
    );

    assert(
      !hasInstruction(evidenceText),
      `${fieldPrefix}_evidence_instruction_detected`,
    );

    assert(
      item.evidence.page === null ||
        (
          Number.isSafeInteger(item.evidence.page) &&
          item.evidence.page >= 1
        ),
      `${fieldPrefix}_evidence_page_invalid`,
    );

    checkEvidence(item.evidence);

    checkValue(
      item.rawDescription,
      item.evidence,
      `${fieldPrefix}.rawDescription`,
    );

    checkValue(
      item.unit,
      item.evidence,
      `${fieldPrefix}.unit`,
    );

    for (
      const key of [
        "quantity",
        "unitPrice",
        "totalPrice",
      ] as const
    ) {
      checkValue(
        item[key],
        item.evidence,
        `${fieldPrefix}.${key}`,
      );
    }
  }

  /*
   * Observations are not evidence fields, but they still cannot contain
   * instructions or subjective supplier recommendations.
   */
  for (
    const [
      index,
      observation,
    ] of quote.observations.entries()
  ) {
    const text = folded(observation);

    assert(
      text.length > 0,
      `observations[${index}]_empty`,
    );

    assert(
      text.length <= 8192,
      `observations[${index}]_too_long`,
    );

    assert(
      !hasInstruction(text),
      `observations[${index}]_instruction_detected`,
    );

    assert(
      !/melhor proposta|melhor fornecedor|recomendo|recomendamos|best (quote|supplier)|we recommend/.test(
        text,
      ),
      `observations[${index}]_subjective_recommendation`,
    );
  }

  /*
   * The DTO currently has no dedicated currency evidence field.
   *
   * BRL therefore requires an explicit marker in at least one existing
   * citation. Portuguese language or Brazilian geography alone is not enough.
   */
if (quote.currency === "BRL") {
  const citations = [
    ...Object.values(quote.evidence).flatMap(
      evidence =>
        evidence === null
          ? []
          : [evidence.text],
    ),

    ...quote.items.map(
      item => item.evidence.text,
    ),
  ].join("\n");

  /*
   * BRL requires explicit documentary support.
   *
   * Accepted:
   *   R$ 4.570,00
   *   4.570,00 BRL
   *   4.570 reais
   *   4.570 reais brasileiros
   *   moeda: real brasileiro
   *
   * We intentionally do NOT accept the isolated word "real",
   * because phrases such as "valor real" are semantically ambiguous.
   */
  assert(
    /R\$|\bBRL\b|\breais\b|\breal brasileiro\b|\breais brasileiros\b/i.test(
      citations,
    ),
    "currency_brl_marker_missing",
  );

  /*
   * A conflicting explicit foreign-currency marker prevents the quote
   * from being safely treated as BRL.
   */
  assert(
    !/US\$|\b(?:USD|EUR|GBP)\b|[€£]/i.test(
      citations,
    ),
    "currency_brl_conflicting_currency",
  );
}

  /*
   * missingFields is deterministic.
   *
   * The LLM is not allowed to choose this list semantically. It has to match
   * exactly what the canonical code derives from the extracted quote.
   */
  const expected =
    expectedMissingFields(quote);

  assert(
    new Set(quote.missingFields).size ===
      quote.missingFields.length,
    "missing_fields_duplicates",
  );

  assert(
    expected.length ===
      quote.missingFields.length,
    "missing_fields_length_mismatch",
  );

  assert(
    expected.every(
      key =>
        quote.missingFields.includes(key),
    ),
    "missing_fields_content_mismatch",
  );
}