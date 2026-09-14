/**
 * Single source of truth for the private Storage bucket name. Never inline
 * this string elsewhere (contract section 13). Must match
 * supabase/migrations/0007_storage.sql.
 */
export const QUOTE_DOCUMENTS_BUCKET = "quote-documents";
