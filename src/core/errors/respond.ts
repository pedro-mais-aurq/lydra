import { NextResponse } from "next/server";
import { AppError } from "@/core/errors/app-error";
import { logRequest } from "@/core/errors/logger";

/**
 * Canonical error envelope (contract section 24). This is the single place
 * that shapes error JSON; route handlers must never hand-roll this object.
 */
export function respondError(
  error: unknown,
  requestId: string,
  stage: string
): NextResponse {
  if (error instanceof AppError) {
    logRequest({
      requestId,
      stage,
      errorCode: error.code,
    });

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: error.details ?? null,
        },
        requestId,
      },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  // Unknown/unexpected error: never leak internals, still return the
  // canonical shape.
  logRequest({
    requestId,
    stage,
    errorCode: "INTERNAL_ERROR",
  });

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
        retryable: false,
        details: null,
      },
      requestId,
    },
    { status: 500, headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Success envelope. requestId is attached for every response, error or not. */
export function respondOk<T>(
  data: T,
  requestId: string,
  status = 200
): NextResponse {
  return NextResponse.json({ data, requestId }, { status, headers: { "Cache-Control": "private, no-store" } });
}
