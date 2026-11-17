import "server-only";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./public-config";

/**
 * Server-side Supabase client for use inside Route Handlers / Server
 * Components. This client validates/refreshes the user session only.
 * Domain mutations use backend.ts after authentication and owner validation.
 */
export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Missing public Supabase configuration.");

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render (not a Route Handler /
          // Server Action) where cookie mutation isn't allowed. Session
          // refresh will be retried on the next request that can set
          // cookies; safe to ignore here.
        }
      },
    },
  });
}
