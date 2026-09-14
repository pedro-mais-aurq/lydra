import { resolveUser } from "./resolve-user";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/core/errors/app-error";

/**
 * The ONLY sanctioned way to determine the acting owner for a request.
 *
 * CRITICAL RULE (contract section 7): owner_id/ownerId/userId received from
 * the browser must never be trusted for authorization. This function never
 * reads the request body; it only asks Supabase to validate the session
 * (JWT) and returns the resulting auth.uid(). If a client sends a manual
 * owner_id anywhere in the request, callers must ignore it - route handlers
 * in this codebase never even parse that field from untrusted input.
 *
 * Uses getUser() (not getSession()) because getUser() revalidates the JWT
 * against the Supabase Auth server rather than trusting a locally-decoded
 * cookie value.
 */
export async function requireOwner(
  supabase: SupabaseClient
): Promise<{ ownerId: string }> {
  const user = await resolveUser(supabase);

  if (!user) {
    throw new AppError({
      code: "UNAUTHENTICATED",
      message: "A valid anonymous session is required.",
      status: 401,
      retryable: false,
    });
  }

  return { ownerId: user.id };
}
