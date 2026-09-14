import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { migrationDigest } from "./migration-digest.mjs";
const cli = resolve("node_modules/supabase/dist/supabase.js");
const proofPath = ".test-evidence/migration-reset.json";
rmSync(proofPath, { force: true });
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Local-only, no linked project/database URL argument; never targets production.
run(["db", "reset", "--local", "--no-seed", "--yes"]);
run(["db", "query", "--local", "--file", "tests/fixtures/assert-migrated.sql"]);
const versions = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).map(f => f.split("_")[0]);
if (versions.some(v => !/^\d+$/.test(v))) throw new Error("Invalid migration version.");
run(["db", "query", "--local", `do $$ begin if (select count(*) from supabase_migrations.schema_migrations where version in (${versions.map(v => `'${v}'`).join(",")})) <> ${versions.length} then raise exception 'Migration history is incomplete'; end if; end $$;`]);
mkdirSync(".test-evidence", { recursive: true });
writeFileSync(proofPath, JSON.stringify({ command: "supabase db reset --local --no-seed --yes", digest: migrationDigest(), sqlAssertions: true, completedAt: new Date().toISOString() }, null, 2) + "\n");
console.log("Clean migration reset and SQL security assertions passed.");
