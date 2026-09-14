import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = spawnSync(process.execPath, [cli, "status", "-o", "env"], { encoding: "utf8" });
if (status.error || status.status !== 0) {
  console.error("INTEGRATION_INFRASTRUCTURE_REQUIRED: local Supabase status failed; security tests were not validated.");
  process.exit(1);
}
// Parse env output as data, never eval/source shell output. Never print keys.
const values = {};
for (const line of status.stdout.split(/\r?\n/)) {
  const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (!match) continue;
  let value = match[2];
  if (value.startsWith('"')) value = JSON.parse(value);
  else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  values[match[1]] = value;
}
if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
  console.error("Local Supabase did not provide API_URL, ANON_KEY and SERVICE_ROLE_KEY.");
  process.exit(1);
}
const child = spawnSync(process.execPath, process.argv.includes("--smoke") ? ["scripts/smoke-http.mjs", "--authenticated"] : ["node_modules/vitest/vitest.mjs", "run", "tests/integration"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: values.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY },
});
if (child.error) console.error(child.error.message);
process.exit(child.status ?? 1);
