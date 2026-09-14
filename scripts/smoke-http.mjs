import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
const middlewareManifest = JSON.parse(readFileSync(".next/server/middleware-manifest.json", "utf8"));
assert.ok(middlewareManifest.middleware["/"], "Production middleware must be compiled from src/middleware.ts.");
const authenticated = process.argv.includes("--authenticated");
if (authenticated && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("AUTHENTICATED_SMOKE_INFRASTRUCTURE_REQUIRED: run npm run test:smoke:security.");
}
const authUrl = authenticated ? process.env.NEXT_PUBLIC_SUPABASE_URL : "http://127.0.0.1:54321";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(authUrl).hostname)) throw new Error("Smoke accepts disposable local Supabase only.");
const authKey = authenticated ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : "smoke-public-placeholder";
const serviceKey = authenticated ? process.env.SUPABASE_SERVICE_ROLE_KEY : "smoke-must-never-be-used";
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: authUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: authKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
});
let logs = "";
child.stdout.on("data", data => { logs += data; });
child.stderr.on("data", data => { logs += data; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Await startup within deadline. */ }
    if (ready) break;
    await delay(200);
  }
  assert.equal(ready, true, `Server not ready: ${logs}`);
  const id = "20000000-0000-4000-8000-000000000001";
  for (const [path, method] of [["/api/comparisons", "GET"], ["/api/comparisons", "POST"], [`/api/comparisons/${id}`, "GET"], [`/api/comparisons/${id}/documents`, "POST"]]) {
    const response = await fetch(origin + path, { method });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, "UNAUTHENTICATED");
    assert.equal(body.error.details, null);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  const cookieName = `sb-${new URL(authUrl).hostname.split(".")[0]}-auth-token`;
  for (const cookie of ["", "base64-eyJhY2Nlc3NfdG9rZW4iOi", "base64-%%%%", "base64-e25vdC1qc29u", "arbitrary-value"]) {
    const response = await fetch(origin + "/api/comparisons", { headers: { cookie: `${cookieName}=${cookie}` } });
    assert.equal(response.status, 401); assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
  }
  const chunked = await fetch(origin + "/api/comparisons", { headers: { cookie: `${cookieName}.0=base64-eyJhY2Nlc3NfdG9rZW4iOi; ${cookieName}.2=arbitrary` } });
  assert.equal(chunked.status, 401);
  console.log("Production HTTP public smoke passed: homepage, 4 unauthenticated routes, 6 malformed cookie cases.");
  if (authenticated) {
    const backend = createClient(authUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const users = []; const paths = [];
    async function session() {
      const jar = new Map();
      const client = createServerClient(authUrl, authKey, { cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: values => values.forEach(({ name, value }) => jar.set(name, value)),
      } });
      const { data, error } = await client.auth.signInAnonymously();
      assert.equal(error, null); assert.ok(data.user); users.push(data.user.id);
      return { id: data.user.id, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") };
    }
    try {
      const a = await session(); const b = await session();
      const created = await fetch(origin + "/api/comparisons", { method: "POST", headers: { cookie: a.cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "Production smoke", owner_id: b.id, status: "completed", result: { forged: true } }) });
      assert.equal(created.status, 201); const { data: comparison } = await created.json();
      const listed = await fetch(origin + "/api/comparisons", { headers: { cookie: a.cookie } });
      assert.equal(listed.status, 200); assert.ok((await listed.json()).data.some(c => c.id === comparison.id));
      const path = `/api/comparisons/${comparison.id}`;
      assert.equal((await fetch(origin + path, { headers: { cookie: a.cookie } })).status, 200);
      const cross = await fetch(origin + path, { headers: { cookie: b.cookie } });
      assert.equal(cross.status, 404); assert.equal((await cross.json()).error.code, "COMPARISON_NOT_FOUND");
      const invalid = new FormData(); invalid.set("file", new File(["forged"], "quote.pdf", { type: "application/pdf" }));
      const rejected = await fetch(origin + path + "/documents", { method: "POST", headers: { cookie: a.cookie }, body: invalid });
      assert.equal(rejected.status, 415); assert.equal((await rejected.json()).error.code, "UNSUPPORTED_FILE_TYPE");
      const form = new FormData(); form.set("file", new File([readFileSync("tests/fixtures/uploads/valid.pdf")], "quote.pdf", { type: "application/pdf" }));
      const uploaded = await fetch(origin + path + "/documents", { method: "POST", headers: { cookie: a.cookie }, body: form });
      assert.equal(uploaded.status, 201); const { data: document } = await uploaded.json();
      paths.push(`${a.id}/${comparison.id}/${document.id}/quote.pdf`);
      const persisted = await backend.from("comparisons").select("owner_id,status,result").eq("id", comparison.id).single();
      assert.equal(persisted.error, null); assert.deepEqual(persisted.data, { owner_id: a.id, status: "draft", result: null });
      console.log("Production authenticated smoke passed: create/list/detail/upload, owner spoof, cross-owner 404, invalid upload.");
    } finally {
      if (paths.length) assert.equal((await backend.storage.from("quote-documents").remove(paths)).error, null);
      for (const id of users) assert.equal((await backend.auth.admin.deleteUser(id)).error, null);
    }
  }
} finally {
  const stopped = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([stopped, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
