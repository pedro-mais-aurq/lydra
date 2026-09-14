import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../src/middleware";
import { AppError } from "@/core/errors/app-error";
const mocks = vi.hoisted(() => ({ resolveUser: vi.fn() }));
vi.mock("@/core/auth/resolve-user", () => ({ resolveUser: mocks.resolveUser }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("middleware controlled infrastructure errors", () => {
  it.each([
    [new AppError({ code: "INTERNAL_ERROR", message: "Authentication service temporarily unavailable.", status: 503, retryable: true }), 503, true],
    [new Error("secret-marker"), 500, false],
  ] as const)("returns a sanitized envelope instead of treating failure as anonymous", async (error, status, retryable) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test");
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.resolveUser.mockRejectedValue(error);
    const response = await middleware(new NextRequest("http://localhost/api/comparisons"));
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", retryable, details: null });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify([body, logs.mock.calls])).not.toContain("secret-marker");
  });
});
