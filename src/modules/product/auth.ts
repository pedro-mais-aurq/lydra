import { createSupabaseBrowserClient } from "@/core/supabase/browser";

// This is session initialization only. requireOwner/getUser remains the authority.
type AuthClient = ReturnType<typeof createSupabaseBrowserClient>;
export function createAnonymousBootstrap(getClient: () => AuthClient) {
  let pending: Promise<void> | undefined;
  return function ensureSession(): Promise<void> {
    if (pending) return pending;
    pending = (async () => {
      try {
        const client = getClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (data.session) return;
        const result = await client.auth.signInAnonymously();
        if (result.error || !result.data.session) throw new Error("Anonymous session unavailable");
      } catch {
        throw new Error("Não foi possível iniciar sua sessão. Verifique a conexão e tente novamente.");
      }
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
export const ensureAnonymousSession = createAnonymousBootstrap(createSupabaseBrowserClient);
