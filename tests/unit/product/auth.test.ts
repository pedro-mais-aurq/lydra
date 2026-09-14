import { describe, it, expect, vi } from "vitest";
import type { createSupabaseBrowserClient } from "@/core/supabase/browser";
import { createAnonymousBootstrap } from "@/modules/product/auth";
function client(existing: boolean, failure = false) {
  const getSession = vi.fn().mockResolvedValue({ data: { session: existing ? {} : null }, error: null });
  const signInAnonymously = vi.fn().mockImplementation(async () => {
    if (failure) return { data: { session: null }, error: new Error("private auth diagnostics") };
    getSession.mockResolvedValue({ data: { session: {} }, error: null });
    return { data: { session: {} }, error: null };
  });
  const value = { auth: { getSession, signInAnonymously } } as unknown as ReturnType<typeof createSupabaseBrowserClient>;
  return { value, getSession, signInAnonymously };
}
describe("product anonymous bootstrap", () => {
  it("reuses an existing session", async () => { const c = client(true); await createAnonymousBootstrap(() => c.value)(); expect(c.signInAnonymously).not.toHaveBeenCalled(); });
  it("creates only one session under concurrent/Strict Mode initialization and reuses it", async () => {
    const c = client(false); const ensure = createAnonymousBootstrap(() => c.value);
    const first = ensure(); expect(ensure()).toBe(first); await first; await ensure();
    expect(c.signInAnonymously).toHaveBeenCalledTimes(1);
  });
  it("reports failure without leaking Auth diagnostics", async () => { const c = client(false, true); const ensure = createAnonymousBootstrap(() => c.value); await expect(ensure()).rejects.toThrow("Não foi possível iniciar sua sessão"); });
  it("does not replace session on a getSession transport error", async () => { const c = client(false); c.getSession.mockResolvedValue({ data: { session: null }, error: new Error("network") }); await expect(createAnonymousBootstrap(() => c.value)()).rejects.toThrow(); expect(c.signInAnonymously).not.toHaveBeenCalled(); });
});
