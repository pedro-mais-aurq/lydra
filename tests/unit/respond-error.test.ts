import { describe, expect, it } from "vitest";
import { respondError } from "@/core/errors/respond";
import { AppError } from "@/core/errors/app-error";

describe("respondError", () => {
  it("produces the canonical error envelope with requestId (contract section 24)", async () => {
    const requestId = "11111111-1111-1111-1111-111111111111";
    const error = new AppError({
      code: "COMPARISON_NOT_FOUND",
      message: "Comparison not found.",
      status: 404,
      retryable: false,
    });

    const response = respondError(error, requestId, "test.stage");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "COMPARISON_NOT_FOUND",
        message: "Comparison not found.",
        retryable: false,
        details: null,
      },
      requestId,
    });
  });

  it("never leaks internal error details for unknown errors", async () => {
    const requestId = "22222222-2222-2222-2222-222222222222";
    const response = respondError(
      new Error("secret internal detail"),
      requestId,
      "test.stage"
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
    expect(body.requestId).toBe(requestId);
  });
});
