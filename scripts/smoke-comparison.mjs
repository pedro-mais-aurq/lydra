import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Production Next build; no mocked middleware, route handler or auth functions.
// This public smoke makes no claim about authenticated Supabase/AI behavior.
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  stdio: ["ignore", "ignore", "ignore"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "smoke-public-placeholder", SUPABASE_SERVICE_ROLE_KEY: "smoke-must-never-be-used" },
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("Production server exited before smoke.");
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* bounded startup wait */ }
    if (ready) break;
    await delay(200);
  }
  assert.equal(ready, true);
  for (const [id, cookie] of [
    ["20000000-0000-4000-8000-000000000001", ""],
    ["malformed-id", ""],
    ["20000000-0000-4000-8000-000000000001", "sb-127-auth-token=base64-%%%%"],
  ]) {
    const response = await fetch(`${origin}/api/comparisons/${id}/process`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ owner_id: "attacker", status: "completed", result: { fake: true } }) });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["error", "requestId"]);
    assert.equal(body.error.code, "UNAUTHENTICATED"); assert.equal(body.error.details, null);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/); assert.match(response.headers.get("cache-control"), /no-store/);
  }
  console.log("PASS: 3 production /process HTTP checks (no session, invalid id before auth, malformed session cookie).");
} finally {
  const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
}
