import "server-only";
import type { EvidenceRef } from "@/contracts";
import { invalidExtraction } from "../domain/errors";

/** Matching normalization only. Never mutates the quote or its literal citations. */
export function folded(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Defense in depth for known instruction patterns, not a general injection detector. */
export function hasInstruction(text: string): boolean {
  return /ignore\b.{0,100}\b(instru|instruction|previous|anterior)|\b(system prompt|developer message|mensagem de sistema)\b|\b(revele|reveal|envie|send)\b.{0,70}\b(segredo|secret|api.?key|token)|\b(retorne|return|set)\s+(suppliername|shipping|displayedtotal)|<\/?(system|developer)>|\[inst\]/i.test(folded(text));
}

export function checkEvidence(evidence: EvidenceRef): void {
  const text = folded(evidence.text);
  if (!text || text.length > 8192 || hasInstruction(text) ||
    /^(o documento informa esse valor|valor encontrado|segundo a proposta|the document states this value)[.!]?$/.test(text) ||
    (evidence.page !== null && (!Number.isSafeInteger(evidence.page) || evidence.page < 1))) throw invalidExtraction();
}

export function supportsText(evidence: EvidenceRef, value: string): boolean {
  return folded(evidence.text).includes(folded(value));
}

/** Parse printed numeric tokens only; no totals, multiplication or currency conversion. */
export function supportsNumber(evidence: EvidenceRef, value: number): boolean {
  const tokens = evidence.text.match(/[-+]?\d+(?:[.,]\d+)*/g) ?? [];
  return tokens.some(token => {
    if (/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token)) {
      return Number(token.replace(/\./g, "").replace(",", ".")) === value;
    }
    if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token)) {
      return Number(token.replace(/,/g, "")) === value;
    }
    const direct = Number(token);
    if (Number.isFinite(direct) && direct === value) return true;
    return /^[-+]?\d+,\d+$/.test(token) && Number(token.replace(",", ".")) === value;
  });
}
export function supportsDisplayedTotal(
  evidence: EvidenceRef,
  value: number,
): boolean {
  const text = folded(evidence.text);

  /*
   * Only explicitly aggregate/document-level monetary expressions qualify.
   *
   * Accepted examples:
   *
   *   Total: R$ 4.500,00
   *   Total geral R$ 4.500,00
   *   Valor total: R$ 4.500,00
   *   Valor total deste contrato é de R$ 4.500,00
   *   Valor total da locação é de R$ 4.570,00
   *   Valor global: R$ 4.500,00
   *   Totalizando R$ 4.700,00
   *   Valor dos materiais é de R$ 4.300,00
   *   Valor do serviço é de R$ 4.500,00
   *
   * Generic item prices are intentionally not enough.
   */

  const aggregatePatterns: RegExp[] = [
    /\bvalor total\b/g,

    /\btotal(?: geral| da proposta| do orcamento| do contrato| da locacao| do fornecimento| do servico)?\b/g,

    /\bvalor global\b/g,

    /\bmontante global\b/g,

    /\btotalizando\b/g,

    /\bamount due\b/g,

    /\bvalor (?:do|da|dos|das) (?:contrato|servico|servicos|locacao|fornecimento|materiais|pedido)\b/g,
  ];

  for (const pattern of aggregatePatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const start =
        match.index + match[0].length;

      /*
       * Search only shortly after the aggregate label.
       *
       * This prevents a "total" label near the beginning of the evidence
       * from supporting an unrelated number much later.
       */
      const candidateWindow = text
        .slice(start, start + 120)
        .split(/\r?\n/, 1)[0];

      if (!candidateWindow) {
        continue;
      }

      /*
       * Allow natural connectors such as:
       *
       *   "é de"
       *   "e de"
       *   ":"
       *   "="
       *   "-"
       *
       * before the actual monetary value.
       */
      const amountPattern =
        /(?:^|[\s:=—-])(?:e\s+de\s+|é\s+de\s+|de\s+)?(?:(?:r\$|brl|usd|us\$|eur|€|\$)\s*)?([-+]?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|[-+]?\d+(?:[.,]\d+)*)/i;

      const amountMatch =
        candidateWindow.match(amountPattern);

      if (
        amountMatch?.[1] !== undefined &&
        supportsNumber(
          {
            page: null,
            text: amountMatch[1],
          },
          value,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export function supportsDeliveryDays(evidence: EvidenceRef, value: number): boolean {
  const text = folded(evidence.text);
  if (/\d+\s*(?:a|ate|to|[-–])\s*\d+\s*(?:dias?|days?)/.test(text)) return false;
  return [...text.matchAll(/([-+]?\d+(?:[.,]\d+)*)\s*(?:dias?|days?)\b/g)].some(match =>
    match[1] !== undefined && supportsNumber({ page: null, text: match[1] }, value));
}
