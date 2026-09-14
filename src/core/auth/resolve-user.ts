import { isAuthError, isAuthRetryableFetchError, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/core/errors/app-error";

const invalidSessionCodes = new Set([
  "bad_jwt", "session_not_found", "session_expired", "refresh_token_not_found",
  "refresh_token_already_used", "user_not_found", "user_banned",
]);

/** Validate with Auth, never trust the cookie's user/owner. Do not hide outages. */
export async function resolveUser(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (error) {
    if (isAuthSessionMissingError(error) || (isAuthError(error) &&
      (error.name === "AuthInvalidJwtError" || (error.code && invalidSessionCodes.has(error.code))))) return null;
    if (isAuthRetryableFetchError(error) || (isAuthError(error) &&
      ((error.status !== undefined && error.status >= 500) || error.status === 429))) {
      throw new AppError({ code: "INTERNAL_ERROR", message: "Authentication service temporarily unavailable.", status: 503, retryable: true });
    }
    throw error; // Shared error envelope logs only the stage/code, never SDK payloads.
  }
}
