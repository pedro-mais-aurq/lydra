import { describe, expect, it } from "vitest";
import { isRetryableProviderFailure } from "@/modules/extraction/providers/provider-failure";

describe("isRetryableProviderFailure — isolated classification of a failed Responses API result", () => {
  it.each([
    { code: "server_error" },
    { code: "internal_error" },
    { code: "rate_limit" },
    { code: "rate_limit_exceeded" },
    { code: "temporarily_unavailable" },
    { code: "service_unavailable" },
    { code: "timeout" },
    { code: "request_timeout" },
    { code: "overloaded" },
    { code: "  Server_Error  " },
  ])("treats documented transient codes as retryable (%o)", error => {
    expect(isRetryableProviderFailure(error)).toBe(true);
  });

  it.each([
    { code: "invalid_request" },
    { code: "invalid_request_error" },
    { code: "unsupported_input" },
    { code: "invalid_parameter" },
    { code: "invalid_prompt" },
    { code: "content_policy_violation" },
    { code: "context_length_exceeded" },
  ])("treats documented permanent codes as non-retryable (%o)", error => {
    expect(isRetryableProviderFailure(error)).toBe(false);
  });

  it.each([
    undefined,
    null,
    {},
    { message: "something went wrong" },
    { code: "totally_unrecognized_code" },
    { code: 12345 },
    { code: "" },
    { code: "   " },
    "a bare string, not an object",
    42,
    [],
  ])("falls back to conservative non-retryable for absent/unknown/malformed error shapes (%o)", error => {
    expect(isRetryableProviderFailure(error)).toBe(false);
  });

  it("does not throw on hostile/deeply nested input", () => {
    expect(() => isRetryableProviderFailure({ code: { toString: () => "server_error" } })).not.toThrow();
    expect(isRetryableProviderFailure({ code: { toString: () => "server_error" } })).toBe(false);
  });
});
