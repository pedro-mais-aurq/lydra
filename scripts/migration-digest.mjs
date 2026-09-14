import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
export function migrationDigest() {
  const digest = createHash("sha256");
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    digest.update(file).update("\0").update(readFileSync(`supabase/migrations/${file}`)).update("\0");
  }
  return digest.digest("hex");
}
