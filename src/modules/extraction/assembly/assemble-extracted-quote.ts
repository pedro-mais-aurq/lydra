import "server-only";
import type { EvidenceRef, ExtractedQuote } from "@/contracts";
import { validateInterpretation, type InterpretationDraft } from "../interpretation/interpretation";
import { selectedCurrency, validateCandidateProvenance, type MonetaryCandidate } from "../monetary/candidates";
import { validateClassification, type MonetaryClassification } from "../classification/classification";
import { assertExtraction } from "../validation/assert";
import { validateExtraction } from "../validation/extracted-quote.schema";
import { expectedMissingFields } from "../validation/missing-fields";

/** Canonical EvidenceRef has one page/excerpt. Pick an existing literal
 * encompassing excerpt, never concatenate unrelated snippets or invent pages. */
function coveringEvidence(evidence: EvidenceRef, candidates: MonetaryCandidate[]): EvidenceRef {
  const excerpts = [evidence, ...candidates.map(candidate => candidate.evidence)];
  const covering = excerpts.find(outer => excerpts.every(inner =>
    outer.page === inner.page && outer.text.includes(inner.text)));
  assertExtraction(covering, "assembly_evidence_not_contiguous");
  return { ...covering };
}

export function assembleExtractedQuote(
  interpretation: InterpretationDraft,
  candidates: readonly MonetaryCandidate[],
  classification: MonetaryClassification,
): ExtractedQuote {
  const draft = validateInterpretation(interpretation);
  validateCandidateProvenance(draft.monetaryEvidence, candidates);
  const selection = validateClassification(classification, candidates, draft.items.length);
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const selected: MonetaryCandidate[] = [];
  const get = (id: string | null): MonetaryCandidate | null => {
    if (id === null) return null;
    const candidate = byId.get(id);
    assertExtraction(candidate, "classification_unknown_candidate");
    selected.push(candidate);
    return candidate;
  };
  const total = get(selection.displayedTotalCandidateId);
  const shipping = get(selection.shippingAmountCandidateId);
  /*
 * "additional" means the shipping charge exists
 * OUTSIDE displayedTotal.
 *
 * Therefore the exact same printed occurrence
 * cannot represent both values.
 *
 * Other cross-role candidate reuse is legitimate
 * and remains allowed.
 */
  if (
    draft.shipping.status ===
    "additional" &&
    selection
      .displayedTotalCandidateId !==
    null &&
    selection
      .shippingAmountCandidateId !==
    null
  ) {
    assertExtraction(
      selection
        .displayedTotalCandidateId !==
      selection
        .shippingAmountCandidateId,
      "assembly_additional_shipping_reuses_displayed_total",
    );
  }
  assertExtraction(!shipping || draft.shipping.status === "additional" || draft.shipping.status === "included", "assembly_shipping_invariant");
  const shippingEvidence = draft.shipping.evidence === null ? null : coveringEvidence(draft.shipping.evidence, shipping ? [shipping] : []);
  const itemSelections = new Map(selection.items.map(item => [item.itemIndex, item]));
  const items = draft.items.map((item, index) => {
    const reference = itemSelections.get(index);
    assertExtraction(reference, "classification_item_index");
    const unitPrice = get(reference.unitPriceCandidateId);
    const totalPrice = get(reference.totalPriceCandidateId);
    return {
      ...item, unitPrice: unitPrice?.value ?? null, totalPrice: totalPrice?.value ?? null,
      evidence: coveringEvidence(item.evidence, [unitPrice, totalPrice].filter((value): value is MonetaryCandidate => value !== null))
    };
  });
  const quote: ExtractedQuote = {
    schemaVersion: 1,
    supplierName: draft.supplierName?.value ?? null,
    displayedTotal: total?.value ?? null,
    currency: selectedCurrency(selected),
    shipping: { status: draft.shipping.status, amount: shipping?.value ?? null },
    paymentTerms: draft.paymentTerms?.value ?? null,
    deliveryDays: draft.deliveryDays?.value ?? null,
    warranty: draft.warranty?.value ?? null,
    items, observations: draft.observations.map(fact => fact.value), missingFields: [],
    evidence: {
      supplierName: draft.supplierName?.evidence ?? null,
      displayedTotal: total?.evidence ?? null,
      shipping: shippingEvidence,
      paymentTerms: draft.paymentTerms?.evidence ?? null,
      deliveryDays: draft.deliveryDays?.evidence ?? null,
      warranty: draft.warranty?.evidence ?? null,
    },
  };
  quote.missingFields = expectedMissingFields(quote);
  return validateExtraction(quote);
}
