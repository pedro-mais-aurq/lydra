const MAX_FILENAME_LENGTH = 120;
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp"] as const;
const FALLBACK_BASENAME = "documento";

/**
 * Deterministic filename sanitizer (contract section 15).
 *
 * - Strips directory components entirely (no '/', '\\', no '..' navigation).
 * - Neutralizes control characters and anything outside a safe charset.
 * - Keeps the extension only if it's one of the allowed types; otherwise the
 *   the unsafe extension is removed. MIME is validated independently.
 * - Truncates to a reasonable length.
 * - Never trusts this value to determine MIME type - it's cosmetic only.
 */
export function sanitizeFileName(rawName: string): string {
  // Take only the last path segment, defeating any '/', '\\', or '..'
  // traversal attempt outright.
  const lastSegment = rawName.split(/[/\\]/).pop() ?? "";

  // Strip control characters and anything that isn't a conservative safe set.
  const cleaned = lastSegment
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-]+/, "")
    .trim();

  const parts = cleaned.split(".");
  const rawExt = parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  const base = parts.join(".") || FALLBACK_BASENAME;

  const ext = (ALLOWED_EXTENSIONS as readonly string[]).includes(rawExt)
    ? rawExt
    : "";

  const truncatedBase = base.slice(0, MAX_FILENAME_LENGTH - ext.length - 1) || FALLBACK_BASENAME;

  return ext ? `${truncatedBase}.${ext}` : truncatedBase;
}
