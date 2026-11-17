import "server-only";

export function getSupabasePublicConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith("sb_secret_") || key === process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}
