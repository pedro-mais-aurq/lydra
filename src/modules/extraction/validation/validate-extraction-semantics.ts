import "server-only";
import type { ExtractedQuote, EvidenceRef } from "@/contracts";
import { assertExtraction as assert } from "./assert";
import { checkEvidence, checkObservation, supportsNumber, supportsText } from "./evidence";
import { expectedMissingFields } from "./missing-fields";
import { extractMonetaryCandidates } from "../monetary/candidates";

function checkValue(value: string | number | null, evidence: EvidenceRef | null): void {
  if (evidence !== null) checkEvidence(evidence);
  if (value === null) return;
  assert(evidence !== null, "value_evidence_missing");
  if (typeof value === "number") {
    assert(Number.isFinite(value) && supportsNumber(evidence, value), "value_number_not_supported");
  } else {
    assert(value.trim().length > 0 && supportsText(evidence, value), "value_text_not_supported");
  }
}

/** Historical export retained for C and completed-document reuse.
 * Factual checks only: semantic decisions belong to the interpreter/classifier.
 * New extractions also validate exact candidate provenance in the assembler.
 * Persisted v1 has no candidate IDs, so reuse validates its literal numbers and
 * monetary markers without reconstructing or inventing a classification. */
export function validateExtractionSemantics(quote: ExtractedQuote): void {
  assert(quote.schemaVersion === 1, "schema_version_invalid");
  for (const key of ["supplierName", "displayedTotal", "paymentTerms", "warranty"] as const) {
    checkValue(quote[key], quote.evidence[key]);
  }
  if (quote.evidence.deliveryDays !== null) checkEvidence(quote.evidence.deliveryDays);
  if (quote.deliveryDays !== null) {
    assert(Number.isSafeInteger(quote.deliveryDays) && quote.deliveryDays >= 0, "delivery_days_invalid");
    assert(quote.evidence.deliveryDays !== null, "delivery_days_evidence_missing");
  }
const { status, amount } =
  quote.shipping;

const shippingEvidence =
  quote.evidence.shipping;

if (status === "not_informed") {
  /*
   * No monetary shipping amount can exist when shipping is not informed.
   */
  assert(
    amount === null,
    "shipping_not_informed_amount",
  );

  /*
   * Evidence is OPTIONAL here:
   *
   * null:
   *   document contains no shipping information at all.
   *
   * non-null:
   *   document explicitly states that shipping is not informed.
   *
   * We validate the evidence structurally, but do not reinterpret its
   * commercial language with regex.
   */
  if (shippingEvidence !== null) {
    checkEvidence(
      shippingEvidence,
    );
  }
} else {
  /*
   * Every affirmative/ambiguous shipping interpretation requires
   * documentary evidence.
   */
  assert(
    shippingEvidence !== null,
    "shipping_evidence_missing",
  );

  checkEvidence(
    shippingEvidence,
  );

  /*
   * These statuses cannot carry a monetary shipping amount.
   */
  if (
    status === "unclear" ||
    status === "not_applicable"
  ) {
    assert(
      amount === null,
      "shipping_amount_invariant",
    );
  }

  /*
   * If an amount exists for included/additional shipping,
   * validate only factual numeric support.
   */
  checkValue(
    amount,
    shippingEvidence,
  );
}

  for (const item of quote.items) {
    checkEvidence(item.evidence);
    checkValue(item.rawDescription, item.evidence);
    checkValue(item.unit, item.evidence);
    for (const key of ["quantity", "unitPrice", "totalPrice"] as const) checkValue(item[key], item.evidence);
  }
  for (const observation of quote.observations) checkObservation(observation);

  if (quote.currency === "BRL") {
    const monetaryFacts = [
      { value: quote.displayedTotal, evidence: quote.evidence.displayedTotal },
      { value: amount, evidence: shippingEvidence },
      ...quote.items.flatMap(item => [
        { value: item.unitPrice, evidence: item.evidence },
        { value: item.totalPrice, evidence: item.evidence },
      ]),
    ];
    let hasBrl = false;
    for (const fact of monetaryFacts) {
      if (fact.value === null || fact.evidence === null) continue;
      // Look only at tokens equal to the persisted selected value. A marker in
      // a supplier/address/payment citation cannot establish monetary currency.
      const matches = extractMonetaryCandidates([{ evidence: fact.evidence, unmarkedTokens: [] }])
        .filter(candidate => candidate.value === fact.value);
      const brl = matches.some(candidate => candidate.explicitCurrency === "BRL");
      assert(brl || !matches.some(candidate => candidate.explicitCurrency === "FOREIGN"), "currency_brl_conflicting_candidate");
      hasBrl ||= brl;
    }
    assert(hasBrl, "currency_brl_candidate_missing");
  }
  const expected = expectedMissingFields(quote);
  assert(new Set(quote.missingFields).size === quote.missingFields.length &&
    expected.length === quote.missingFields.length && expected.every(key => quote.missingFields.includes(key)), "missing_fields_mismatch");
}
