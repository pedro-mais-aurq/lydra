import { createBrowserClient } from "@supabase/ssr";

type PublicConfig = { url: string; key: string };

/** The HTML bootstrap contains only the public Supabase project URL and key. */
export function createSupabaseBrowserClient() {
  let config: PublicConfig | null = null;
  if (typeof document !== "undefined") {
    const bootstrap = document.getElementById("lydra-supabase-config")?.textContent;
    if (bootstrap) config = JSON.parse(bootstrap) as PublicConfig | null;
  }

  const url = config?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = config?.key ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing public Supabase configuration.");
  return createBrowserClient(url, key);
}
