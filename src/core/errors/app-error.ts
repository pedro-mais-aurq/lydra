import type { AppErrorCode } from "@/contracts";
export type { AppErrorCode } from "@/contracts";

interface AppErrorInput {
  code: AppErrorCode;
  message: string;
  /** HTTP status to respond with. */
  status: number;
  retryable: boolean;
  details?: unknown;
}

/**
 * Canonical, typed application error. Route handlers throw this and a single
 * shared helper (see respond-error.ts) turns it into the contract's error
 * JSON shape. This avoids replicating error JSON by hand in every endpoint
 * (contract section 24).
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(input: AppErrorInput) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.details = input.details ?? null;
  }
}
