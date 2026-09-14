import { describe, expect, it } from "vitest";
import { backend, createAnonymousUserClient, createComparisonFixture, createDocumentFixture, documentInput } from "./helpers";

describe("real RLS and Data API authority", () => {
  it("A sees A, B sees B, neither sees the other's comparisons/documents/feedback", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const ca = await createComparisonFixture(a.userId); const cb = await createComparisonFixture(b.userId);
    const da = await createDocumentFixture(a.userId, ca.id); const db = await createDocumentFixture(b.userId, cb.id);
    const { data: feedback, error: fixtureError } = await backend.from("comparison_feedback").insert([
      { comparison_id: ca.id, owner_id: a.userId, useful: true, accuracy: "accurate" },
      { comparison_id: cb.id, owner_id: b.userId, useful: false, accuracy: "partial" },
    ]).select("id,owner_id");
    expect(fixtureError).toBeNull(); expect(feedback).toHaveLength(2);
    for (const [user, other, ownComparison, ownDocument] of [[a, b, ca, da], [b, a, cb, db]] as const) {
      for (const table of ["comparisons", "quote_documents", "comparison_feedback"] as const) {
        const { data, error } = await user.client.from(table).select();
        expect(error).toBeNull(); expect(data).toHaveLength(1);
        expect(data![0].owner_id).toBe(user.userId);
        expect(data!.some(row => row.owner_id === other.userId)).toBe(false);
        if (table === "comparisons") expect(data![0].id).toBe(ownComparison.id);
        if (table === "quote_documents") expect(data![0].id).toBe(ownDocument.id);
      }
    }
  });

  it("authenticated cannot INSERT, UPDATE or DELETE even their own domain rows", async () => {
    const a = await createAnonymousUserClient();
    const comparison = await createComparisonFixture(a.userId);
    const document = await createDocumentFixture(a.userId, comparison.id);
    const { data: feedback, error: fixtureError } = await backend.from("comparison_feedback").insert({ comparison_id: comparison.id, owner_id: a.userId, useful: true, accuracy: "accurate" }).select().single();
    expect(fixtureError).toBeNull(); expect(feedback).not.toBeNull();
    const tables: Array<{ name: string; id: string; insert: Record<string, unknown>; update: Record<string, unknown> }> = [
      { name: "comparisons", id: comparison.id, insert: { owner_id: a.userId, title: "forged", status: "completed", result: { forged: true } }, update: { status: "completed", result: { forged: true } } },
      { name: "quote_documents", id: document.id, insert: documentInput(a.userId, comparison.id), update: { status: "completed", extracted_data: { schemaVersion: 1 }, extraction_schema_version: 1, storage_path: "arbitrary/path" } },
      { name: "comparison_feedback", id: feedback!.id, insert: { comparison_id: comparison.id, owner_id: a.userId, useful: false, accuracy: "inaccurate" }, update: { useful: false } },
    ];
    for (const table of tables) {
      for (const operation of [
        a.client.from(table.name).insert(table.insert),
        a.client.from(table.name).update(table.update).eq("id", table.id),
        a.client.from(table.name).delete().eq("id", table.id),
      ]) {
        const { error } = await operation;
        expect(error?.code).toBe("42501");
      }
    }
    const { data: persisted, error } = await backend.from("comparisons").select().eq("id", comparison.id).single();
    expect(error).toBeNull(); expect(persisted.status).toBe("draft"); expect(persisted.result).toBeNull();
    const { data: saved, error: docError } = await backend.from("quote_documents").select().eq("id", document.id).single();
    expect(docError).toBeNull(); expect(saved.status).toBe("uploaded"); expect(saved.extracted_data).toBeNull();
    expect(saved.extraction_schema_version).toBeNull(); expect(saved.storage_path).toBe(document.storage_path);
  });
});
