import { describe, expect, it } from "vitest";
import { createComparisonSchema } from "@/core/validation/schemas";

describe("createComparisonSchema", () => {
  it("strips a client-supplied owner_id instead of accepting it (contract section 36)", () => {
    const parsed = createComparisonSchema.parse({
      title: "Minha comparação",
      owner_id: "11111111-1111-1111-1111-111111111111",
      ownerId: "22222222-2222-2222-2222-222222222222",
    } as unknown);

    expect(parsed).toEqual({ title: "Minha comparação" });
    expect((parsed as Record<string, unknown>).owner_id).toBeUndefined();
    expect((parsed as Record<string, unknown>).ownerId).toBeUndefined();
  });

  it("rejects an empty title", () => {
    const result = createComparisonSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });
});
