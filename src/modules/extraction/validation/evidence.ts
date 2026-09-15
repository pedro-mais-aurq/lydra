import "server-only";
import { NUMERIC_TOKENS } from "../monetary/number";
import type { EvidenceRef } from "@/contracts";
import { invalidExtraction } from "../domain/errors";
import { assertExtraction } from "./assert";

/** Matching normalization only. Never mutates the quote or its literal citations. */
export function folded(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Defense in depth for known instruction patterns, not a general injection detector. */
export function hasInstruction(text: string): boolean {
  return /ignore\b.{0,100}\b(instru|instruction|previous|anterior)|\b(system prompt|developer message|mensagem de sistema)\b|\b(revele|reveal|envie|send)\b.{0,70}\b(segredo|secret|api.?key|token)|\b(retorne|return|set)\s+(suppliername|shipping|displayedtotal)|<\/?(system|developer)>|\[inst\]/i.test(folded(text));
}

export function checkEvidence(
  evidence: EvidenceRef,
): void {
  const text = folded(evidence.text);

  assertExtraction(
    text.length > 0,
    "evidence_empty",
  );

  assertExtraction(
    text.length <= 8192,
    "evidence_too_long",
  );

  assertExtraction(
    !hasInstruction(text),
    "evidence_instruction_detected",
  );

  assertExtraction(
    !/^(o documento informa esse valor|valor encontrado|segundo a proposta|the document states this value)[.!]?$/.test(
      text,
    ),
    "evidence_placeholder",
  );

  assertExtraction(
    evidence.page === null ||
      (
        Number.isSafeInteger(evidence.page) &&
        evidence.page >= 1
      ),
    "evidence_page_invalid",
  );
}

export function supportsText(
  evidence: EvidenceRef,
  value: string,
): boolean {
  const normalizedEvidence =
    folded(evidence.text);

  const normalizedValue =
    folded(value);

  return (
    normalizedValue.length > 0 &&
    normalizedEvidence.includes(normalizedValue)
  );
}

/** Parse printed numeric tokens only; no totals, multiplication or currency conversion. */
export function supportsNumber(evidence: EvidenceRef, value: number): boolean {
  return [...evidence.text.matchAll(NUMERIC_TOKENS)].some(match => {
    const token = match[0].replace(/[ \u00a0\u202f]/g, "");
    if (/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token)) {
      return Number(token.replace(/\./g, "").replace(",", ".")) === value;
    }
    if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token)) {
      return Number(token.replace(/,/g, "")) === value;
    }
    return Number(token) === value || (/^[-+]?\d+,\d+$/.test(token) && Number(token.replace(",", ".")) === value);
  });
}

/** Retained anti-injection/recommendation guard; never classifies money or shipping. */
export function checkObservation(observation: string): void {
  const text = folded(observation);
  if (!text || text.length > 8192 || hasInstruction(text) ||
    /melhor proposta|melhor fornecedor|recomendo|recomendamos|best (quote|supplier)|we recommend/.test(text)) throw invalidExtraction();
}
