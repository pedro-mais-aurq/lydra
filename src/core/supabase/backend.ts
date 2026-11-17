import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Privileged domain access. Call only AFTER requireOwner validates the session.
 * This client has no cookies/session and must never inherit a user's JWT.
 * service_role bypasses RLS: every repository operation must scope the owner.
 */
export function createSupabaseBackendClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing server-side Supabase configuration.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
