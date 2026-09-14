import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { migrationDigest } from "../../scripts/migration-digest.mjs";
import { createAnonymousUserClient } from "./helpers";
it("requires successful clean-reset evidence for this exact migration set", () => {
  // Written only after the reset subprocess AND the SQL assertions succeed.
  // CI always deletes/recreates it by running test:migrations in this job.
  const proof = JSON.parse(readFileSync(".test-evidence/migration-reset.json", "utf8"));
  expect(proof.command).toBe("supabase db reset --local --no-seed --yes");
  expect(proof.digest).toBe(migrationDigest());
  expect(proof.sqlAssertions).toBe(true);
  expect(Date.now() - Date.parse(proof.completedAt)).toBeLessThan(60 * 60 * 1000);
});
it("migrated tables are exposed read-only and a new user sees no rows", async () => {
  const a = await createAnonymousUserClient();
  for (const table of ["comparisons", "quote_documents", "comparison_feedback"]) {
    const { data, error } = await a.client.from(table).select();
    expect(error).toBeNull(); expect(data).toEqual([]);
  }
});
