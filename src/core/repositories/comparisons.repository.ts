import { comparisonResultSchema, comparisonStatusSchema } from "@/contracts";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/core/errors/app-error";
import type { Comparison } from "@/core/domain/types";
import type { AppErrorCode, ComparisonResult } from "@/contracts";

interface ComparisonRow {
  id: string;
  owner_id: string;
  title: string;
  status: Comparison["status"];
  result: Comparison["result"];
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: ComparisonRow): Comparison {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    status: comparisonStatusSchema.parse(row.status),
    result: row.result === null ? null : comparisonResultSchema.parse(row.result),
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Only the operations actually used by the Foundation in this round. No
 * speculative methods for future agents (contract section 22).
 */
export class ComparisonRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(params: { ownerId: string; title: string }): Promise<Comparison> {
    const { data, error } = await this.supabase
      .from("comparisons")
      .insert({ owner_id: params.ownerId, title: params.title })
      .select()
      .single();

    if (error || !data) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to create comparison.",
        status: 500,
        retryable: true,
      });
    }

    return toDomain(data as ComparisonRow);
  }

  async listByOwner(ownerId: string): Promise<Comparison[]> {
    const { data, error } = await this.supabase
      .from("comparisons")
      .select()
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to list comparisons.",
        status: 500,
        retryable: true,
      });
    }

    return (data as ComparisonRow[]).map(toDomain);
  }

  /**
   * Returns null (not an error) when the comparison doesn't exist OR belongs
   * to a different owner. Callers turn null into a 404 COMPARISON_NOT_FOUND,
   * which is what makes cross-owner requests indistinguishable from a
   * genuinely missing resource (contract section 12).
   */
  async findByIdForOwner(params: {
    id: string;
    ownerId: string;
  }): Promise<Comparison | null> {
    const { data, error } = await this.supabase
      .from("comparisons")
      .select()
      .eq("id", params.id)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (error) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Failed to load comparison.",
        status: 500,
        retryable: true,
      });
    }

    return data ? toDomain(data as ComparisonRow) : null;
  }

  /** Parent-row compare-and-set coordinates with A.2's upload trigger. */
  async tryAcquireProcessing(params: { id: string; ownerId: string }): Promise<Comparison | null> {
    const { data, error } = await this.supabase.from("comparisons")
      .update({ status: "processing", result: null, error_code: null })
      .eq("id", params.id).eq("owner_id", params.ownerId).in("status", ["draft", "failed"])
      .select().maybeSingle();
    if (error) throw new AppError({ code: "INTERNAL_ERROR", message: "Failed to acquire comparison processing.", status: 500, retryable: true });
    return data ? toDomain(data as ComparisonRow) : null;
  }

  async completeProcessing(params: { id: string; ownerId: string; updatedAt: string; result: ComparisonResult }): Promise<Comparison> {
    const result = comparisonResultSchema.parse(params.result);
    const { data, error } = await this.supabase.from("comparisons")
      .update({ status: "completed", result, error_code: null })
      .eq("id", params.id).eq("owner_id", params.ownerId).eq("status", "processing").eq("updated_at", params.updatedAt)
      .select().maybeSingle();
    if (error) throw new AppError({ code: "INTERNAL_ERROR", message: "Failed to persist comparison result.", status: 500, retryable: true });
    if (!data) throw new AppError({ code: "INVALID_COMPARISON_STATE", message: "Comparison processing attempt is no longer current.", status: 409, retryable: false });
    return toDomain(data as ComparisonRow);
  }

  async failProcessing(params: { id: string; ownerId: string; updatedAt: string; errorCode: AppErrorCode }): Promise<void> {
    const { data, error } = await this.supabase.from("comparisons")
      .update({ status: "failed", result: null, error_code: params.errorCode })
      .eq("id", params.id).eq("owner_id", params.ownerId).eq("status", "processing").eq("updated_at", params.updatedAt)
      .select("id").maybeSingle();
    if (error) throw new AppError({ code: "INTERNAL_ERROR", message: "Failed to persist comparison failure.", status: 500, retryable: true });
    if (!data) throw new AppError({ code: "INVALID_COMPARISON_STATE", message: "Comparison processing attempt is no longer current.", status: 409, retryable: false });
  }
}
