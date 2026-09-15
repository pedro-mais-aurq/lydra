import "server-only";

export const NUMERIC_TOKENS = /[-+]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*)/g;

export function parseMonetaryNumber(raw: string): number | null {
  let token = raw;
  if (/[ \u00a0\u202f]/.test(token)) {
    if (!/^[-+]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/.test(token)) return null;
    token = token.replace(/[ \u00a0\u202f]/g, "");
  }
  let normalized: string;
  if (/^[-+]?\d+$/.test(token)) normalized = token;
  else if (/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(token)) normalized = token.replace(/\./g, "").replace(",", ".");
  else if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(token)) normalized = token.replace(/,/g, "");
  else if (/^[-+]?\d+[.,]\d{1,2}$/.test(token)) normalized = token.replace(",", ".");
  else return null;
  const value = Number(normalized);
  // Canonical JS numbers must retain cent precision; no rounding or repair.
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100 ? value : null;
}

