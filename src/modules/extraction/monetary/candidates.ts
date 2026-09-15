import "server-only";
import { NUMERIC_TOKENS, parseMonetaryNumber } from "./number";
import { evidenceRefSchema, type EvidenceRef } from "@/contracts";
import { monetaryEvidenceSchema, type MonetaryEvidence } from "../interpretation/interpretation";
import { assertExtraction } from "../validation/assert";
import { checkEvidence } from "../validation/evidence";

export type MonetaryCandidate = {
  id: string;
  value: number;
  currency: "BRL" | "UNKNOWN";
  raw: string;
  evidence: EvidenceRef;
  sourceEvidenceIndex: number;
  start: number;
  end: number;
  /** Internal provenance: UNKNOWN alone cannot distinguish unmarked from foreign. */
  explicitCurrency: "BRL" | "FOREIGN" | null;
};

const candidateEvidenceSchema = monetaryEvidenceSchema.extend({ evidence: evidenceRefSchema }).strict();

const H = "[ \\t\\u00a0\\u202f]";
const MARKER = "(?:R\\$|US\\$|C\\$|A\\$|BRL|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|[€£¥$])";
const PREFIX = new RegExp(`(${MARKER})${H}*$`, "i");
const SUFFIX = new RegExp(`^${H}*(${MARKER})(?![\\p{L}\\p{N}])`, "iu");
// Numeric syntax only. Neither labels nor financial roles are inspected.



function markerCurrency(markers: string[]): MonetaryCandidate["explicitCurrency"] {
  if (markers.length === 0) return null;
  return markers.every(marker => /^(R\$|BRL)$/i.test(marker)) ? "BRL" : "FOREIGN";
}

/** Only literal occurrences may become candidates. The interpreter supplies
 * raw unmarked tokens as semantic hints; offsets, numeric values and currency
 * are computed here. A bare number elsewhere in the excerpt is never enough. */
export function extractMonetaryCandidates(entries: readonly MonetaryEvidence[]): MonetaryCandidate[] {
  assertExtraction(entries.length <= 500, "monetary_candidate_limit");
  const candidates: MonetaryCandidate[] = [];
  for (const [sourceEvidenceIndex, input] of entries.entries()) {
    const parsed = candidateEvidenceSchema.safeParse(input);
    assertExtraction(parsed.success, "monetary_candidate_invalid");
    const { evidence, unmarkedTokens } = parsed.data;
    checkEvidence(evidence);
    const requested = new Set(unmarkedTokens);
    assertExtraction(requested.size === unmarkedTokens.length, "monetary_unmarked_duplicate");
    for (const raw of requested) assertExtraction(parseMonetaryNumber(raw) !== null, "monetary_unmarked_invalid");
    const found = new Set<string>();
    for (const match of evidence.text.matchAll(NUMERIC_TOKENS)) {
      const numberStart = match.index;
      const numberEnd = numberStart + match[0].length;
      const before = evidence.text.slice(0, numberStart);
      const after = evidence.text.slice(numberEnd);
      const prefix = before.match(PREFIX);
      const suffixMatch = after.match(SUFFIX);
      // A marker followed by another number belongs to that next number.
      const suffix = suffixMatch && !/^[ \t\u00a0\u202f]*[-+]?\d/.test(after.slice(suffixMatch[0].length)) ? suffixMatch : null;
      const start = prefix ? numberStart - prefix[0].length : numberStart;
      const end = suffix ? numberEnd + suffix[0].length : numberEnd;
      const left = evidence.text.slice(0, start);
      const right = evidence.text.slice(end);
      // Don't parse fragments of identifiers, phone numbers, dates or percentages.
      if (/[\p{L}\p{N}_/+\-]$/u.test(left) || /\d[.,]$/.test(left) || /^[\p{L}\p{N}_/+\-]/u.test(right) ||
          /^[.,]\d/.test(right) || /^[ \t\u00a0\u202f]+\d/.test(right) || /^[ \t\u00a0\u202f]*[%‰]/.test(right)) continue;
      const markers = [prefix?.[1], suffix?.[1]].filter((marker): marker is string => marker !== undefined);
      const unmarked = markers.length === 0;
      if (unmarked && !requested.has(match[0])) continue;
      const value = parseMonetaryNumber(match[0]);
      assertExtraction(value !== null, "monetary_candidate_invalid");
      if (unmarked) found.add(match[0]);
      const explicitCurrency = markerCurrency(markers);
      candidates.push({
        id: `money-${candidates.length}`, value, currency: explicitCurrency === "BRL" ? "BRL" : "UNKNOWN",
        raw: evidence.text.slice(start, end), evidence: { ...evidence }, sourceEvidenceIndex, start, end, explicitCurrency,
      });
      assertExtraction(candidates.length <= 1000, "monetary_candidate_limit");
    }
    assertExtraction([...requested].every(raw => found.has(raw)), "monetary_unmarked_not_found");
  }
  return candidates;
}

/** Currency derives exclusively from selected facts. An unmarked amount does
 * not establish BRL, and explicit foreign currency prevents claiming BRL. */
export function selectedCurrency(candidates: readonly MonetaryCandidate[]): "BRL" | "UNKNOWN" {
  return candidates.some(candidate => candidate.explicitCurrency === "BRL") &&
    !candidates.some(candidate => candidate.explicitCurrency === "FOREIGN") ? "BRL" : "UNKNOWN";
}

export function validateCandidateProvenance(entries: readonly MonetaryEvidence[], candidates: readonly MonetaryCandidate[]): void {
  const expected = extractMonetaryCandidates(entries);
  assertExtraction(expected.length === candidates.length, "monetary_candidate_invalid");
  for (const [index, candidate] of expected.entries()) {
    const actual = candidates[index];
    assertExtraction(actual && Object.keys(actual).length === Object.keys(candidate).length &&
      actual.id === candidate.id && actual.value === candidate.value && actual.currency === candidate.currency &&
      actual.raw === candidate.raw && actual.sourceEvidenceIndex === candidate.sourceEvidenceIndex &&
      actual.start === candidate.start && actual.end === candidate.end && actual.explicitCurrency === candidate.explicitCurrency &&
      actual.evidence?.page === candidate.evidence.page && actual.evidence?.text === candidate.evidence.text, "monetary_candidate_invalid");
  }
}
