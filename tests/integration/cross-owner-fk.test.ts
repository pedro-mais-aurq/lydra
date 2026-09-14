import { describe, expect, it } from "vitest";
import { backend, createAnonymousUserClient, createComparisonFixture, documentInput } from "./helpers";

describe("composite owner foreign keys, independently of RLS", () => {
  it("service-role document insert pointing at another owner's comparison fails with the actual FK code", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const cb = await createComparisonFixture(b.userId);
    const { error } = await backend.from("quote_documents").insert(documentInput(a.userId, cb.id));
    expect(error?.code).toBe("23503");
    expect(error?.message).toContain("quote_documents_comparison_owner_fk");
  });
  it("service-role feedback insert with mismatched owner fails with the actual FK code", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const cb = await createComparisonFixture(b.userId);
    const { error } = await backend.from("comparison_feedback").insert({ comparison_id: cb.id, owner_id: a.userId, useful: true, accuracy: "accurate" });
    expect(error?.code).toBe("23503");
    expect(error?.message).toContain("comparison_feedback_comparison_owner_fk");
  });
});
