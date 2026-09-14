import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { requireOwner } from "@/core/auth/require-owner";
import { resolveUser } from "@/core/auth/resolve-user";
import { middleware } from "../../src/middleware";

const url = "http://127.0.0.1:54321";
const key = "test-public-key";
const cookieName = "sb-127-auth-token";
const malformed = [
  ["empty", [{ name: cookieName, value: "" }]],
  ["truncated", [{ name: cookieName, value: 'base64-eyJhY2Nlc3NfdG9rZW4iOi' }]],
  ["invalid base64", [{ name: cookieName, value: "base64-%%%%" }]],
  ["invalid JSON", [{ name: cookieName, value: `base64-${Buffer.from('{secret-marker').toString('base64url')}` }]],
  ["incomplete chunks", [{ name: `${cookieName}.0`, value: "base64-eyJhY2Nlc3NfdG9rZW4iOi" }, { name: `${cookieName}.2`, value: "arbitrary" }]],
  ["arbitrary", [{ name: cookieName, value: "secret-marker" }]],
] as const;
const client = (getAll = () => [] as { name: string; value: string }[]) => createServerClient(url, key, { cookies: { getAll, setAll() {} } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("real SSR malformed cookie regression", () => {
  it.each(malformed)("%s becomes controlled unauthenticated, with no Auth request", async (_, cookies) => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = client(() => cookies.map(c => ({ ...c })));
    await expect(requireOwner(supabase)).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(network).not.toHaveBeenCalled();
    expect(JSON.stringify(warnings.mock.calls)).not.toContain("secret-marker");
  });
  it.each(malformed)("middleware survives %s", async (_, cookies) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", key);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = new NextRequest("http://localhost/api/comparisons");
    cookies.forEach(c => request.cookies.set(c.name, c.value));
    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
describe("session failures are classified without suppressing outages", () => {
  it.each([new AuthSessionMissingError(), new AuthApiError("invalid", 401, "bad_jwt")])("known invalid session is absent", async error => {
    const supabase = client(); vi.spyOn(supabase.auth, "getUser").mockRejectedValue(error);
    expect(await resolveUser(supabase)).toBeNull();
  });
  it.each([new AuthRetryableFetchError("offline", 503), new AuthApiError("down", 500, "unexpected_failure"), new AuthApiError("limited", 429, "over_request_rate_limit")])("infrastructure failures are retryable 503", async error => {
    const supabase = client(); vi.spyOn(supabase.auth, "getUser").mockRejectedValue(error);
    await expect(requireOwner(supabase)).rejects.toMatchObject({ status: 503, code: "INTERNAL_ERROR", retryable: true });
  });
  it("unexpected failure is propagated to the controlled error boundary", async () => {
    const error = new Error("internal"); const supabase = client();
    vi.spyOn(supabase.auth, "getUser").mockRejectedValue(error);
    await expect(resolveUser(supabase)).rejects.toBe(error);
  });
});
