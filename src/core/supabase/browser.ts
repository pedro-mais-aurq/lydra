import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Only ever receives the public URL and the
 * anon key (both NEXT_PUBLIC_*, safe to ship in the bundle). Never import
 * this module from server-only code paths that need elevated privileges.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient(url, anonKey);
}
