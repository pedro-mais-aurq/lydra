/** Isolated product UI smoke. Uses a local fake Auth and canonical HTTP DTOs.
 * Dependencies external to the frozen app lockfile: Playwright and a Chromium binary.
 * Run against a build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key. No real credentials/data are used.
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { strict as assert } from "node:assert";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require("playwright");
const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/product.json", import.meta.url), "utf8"));
const output = new URL("../docs/validation-p5-1/browser/", import.meta.url);
mkdirSync(output, { recursive: true });
let signups = 0; let authFailure = false;
const user = { id: "70000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: "2026-09-13T00:00:00Z" };
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: "authenticated" })).toString("base64url")}.test-signature`;
const auth = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3105");
  response.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") { response.end(); return; }
  if (request.url?.startsWith("/auth/v1/signup")) {
    signups++;
    if (authFailure) { response.writeHead(503); response.end(JSON.stringify({ msg: "Auth unavailable" })); return; }
    response.end(JSON.stringify({ user, access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600 })); return;
  }
  response.end(JSON.stringify(user));
});
await new Promise((resolve) => auth.listen(54399, "127.0.0.1", resolve));
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "-p", "3105"], { stdio: "ignore", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key" } });
let browser; const checks = [];
async function check(name, action) { await action(); checks.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
const envelope = (data) => ({ data, requestId: "70000000-0000-4000-8000-000000000002" });
const errorBody = (retryable = true, code = "EXTRACTION_PROVIDER_ERROR") => ({ error: { code, message: "Controlled error", retryable, details: null }, requestId: "70000000-0000-4000-8000-000000000003" });
const base = "http://127.0.0.1:3105";
const files = ["A.pdf", "B.pdf", "C.pdf"].map((name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nfixture") }));
async function setup({ status = "draft", failUpload = false, failProcess = false, retryable = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let current = structuredClone(fixture); current.status = status;
  if (status !== "completed") current.result = null;
  if (status === "draft") current.documents = [];
  if (status === "failed") current.errorCode = "EXTRACTION_PROVIDER_ERROR";
  const calls = []; let uploads = 0; let processes = 0;
  await context.route("**/api/comparisons**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${path}`);
    if (path === "/api/comparisons" && request.method() === "POST") {
      const body = request.postDataJSON(); assert.equal(body.title, "Reforma"); assert.deepEqual(Object.keys(body), ["title"]);
      current.title = body.title; await route.fulfill({ status: 201, json: envelope({ ...current, documents: undefined }) }); return;
    }
    if (path.endsWith("/documents")) {
      uploads++;
      assert.match(request.headers()["content-type"], /multipart\/form-data/);
      if (failUpload && uploads === 2) { await route.fulfill({ status: 500, json: errorBody(true, "INTERNAL_ERROR") }); return; }
      const document = { ...fixture.documents[uploads - 1], status: "uploaded", extractedData: null, extractionSchemaVersion: null };
      current.documents.push(document); await route.fulfill({ status: 201, json: envelope(document) }); return;
    }
    if (path.endsWith("/process")) {
      processes++; current.status = "processing";
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (failProcess && processes === 1) {
        current.status = "failed"; current.errorCode = "EXTRACTION_PROVIDER_ERROR"; current.updatedAt = "2026-09-13T12:01:00Z";
        await route.fulfill({ status: 502, json: errorBody(retryable) }); return;
      }
      current = structuredClone(fixture); await route.fulfill({ status: 200, json: envelope({ ...current, documents: undefined }) }); return;
    }
    await route.fulfill({ status: 200, json: envelope(current) });
  });
  return { context, page, calls, errors, counters: () => ({ uploads, processes }), open: (path) => page.goto(`${base}${path}`) };
}
async function prepare(s) {
  await s.open("/comparisons/new");
  await s.page.getByLabel("Título da comparação").fill("Reforma");
  await s.page.getByLabel("Selecionar orçamentos em PDF ou imagem").setInputFiles(files);
  await s.page.getByRole("button", { name: "Analisar propostas" }).click();
}
try {
  for (let i=0; i<100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  await check("landing desktop and mobile preserve D", async () => {
    const page = await browser.newPage(); await page.goto(base); await page.screenshot({ path: new URL("landing-desktop.png", output).pathname, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: new URL("landing-mobile.png", output).pathname, fullPage: true }); await page.close();
  });
  await check("anonymous session, create, 3 multipart uploads, process, result, refresh", async () => {
    const s = await setup(); const initialSignups = signups; await prepare(s);
    await s.page.getByText("Comparação concluída", { exact: true }).waitFor();
    assert.equal(s.counters().uploads, 3); assert.equal(s.counters().processes, 1); assert.equal(signups - initialSignups, 1);
    const metrics = s.page.locator(".decision-metric"); assert.match(await metrics.nth(0).innerText(), /4\.570,00/); assert.match(await metrics.nth(1).innerText(), /4\.300,00[\s\S]*Parcial/);
    await s.page.screenshot({ path: new URL("result-desktop.png", output).pathname, fullPage: true });
    await s.page.reload(); await s.page.getByText("Comparação concluída", { exact: true }).waitFor(); assert.equal(s.counters().processes, 1); assert.equal(signups - initialSignups, 1);
    await s.page.setViewportSize({ width: 390, height: 844 }); await s.page.emulateMedia({ reducedMotion: "reduce" }); await s.page.screenshot({ path: new URL("result-mobile.png", output).pathname, fullPage: true });
    assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(s.errors, []); await s.context.close();
  });
  await check("title and 1/2/4/5-file UI validation; oversized/unsupported rejection", async () => {
    const s = await setup(); await s.open("/comparisons/new"); const input = s.page.getByLabel("Selecionar orçamentos em PDF ou imagem"); const button = s.page.getByRole("button", { name: "Analisar propostas" });
    await input.setInputFiles([files[0]]); assert.equal(await button.isEnabled(), false); await s.page.getByLabel("Título da comparação").fill("Reforma"); assert.equal(await button.isEnabled(), false);
    await input.setInputFiles([files[1]]); assert.equal(await button.isEnabled(), true);
    await s.page.getByLabel("Título da comparação").fill("   "); assert.equal(await button.isEnabled(), false); await s.page.getByLabel("Título da comparação").fill("Reforma");
    await input.setInputFiles([files[0], files[2]]); assert.equal(await button.isEnabled(), true); await input.setInputFiles([files[0]]); await s.page.locator(".upload-error").waitFor(); assert.equal(await s.page.locator(".document-card").count(), 4);
    for (let i=0; i<4; i++) await s.page.getByRole("button", { name: /^Remover/ }).first().click();
    await input.setInputFiles([{ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10485761) }]); assert.match(await s.page.locator(".upload-error").innerText(), /10 MiB/);
    await input.setInputFiles([{ name: "attack.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }]); assert.match(await s.page.locator(".upload-error").innerText(), /Formato não suportado/); assert.equal(s.calls.length, 0);
    await s.page.screenshot({ path: new URL("workspace.png", output).pathname, fullPage: true }); await s.context.close();
  });
  await check("partial upload failure preserves first document and never calls process", async () => {
    const s = await setup({ failUpload: true }); await prepare(s); await s.page.getByText("O lote foi interrompido.", { exact: false }).waitFor(); assert.deepEqual(s.counters(), { uploads: 2, processes: 0 });
    await s.page.getByRole("link", { name: "Consultar documentos recebidos" }).click(); await s.page.getByRole("heading", { name: "Documentos recebidos", exact: true, level: 1 }).waitFor(); assert.equal(s.counters().processes, 0); await s.context.close();
  });
  await check("transient failure retry reuses comparison and uploads", async () => {
    const s = await setup({ failProcess: true }); await prepare(s); const retry = s.page.getByRole("button", { name: "Tentar análise novamente" }); await retry.waitFor();
    await s.page.reload(); await retry.waitFor(); await retry.click(); await s.page.getByText("Comparação concluída", { exact: true }).waitFor(); assert.deepEqual(s.counters(), { uploads: 3, processes: 2 }); assert.equal(s.calls.filter((call) => call === "POST /api/comparisons").length, 1); await s.context.close();
  });
  await check("nonretryable provider failure does not offer retry", async () => {
    const s = await setup({ failProcess: true, retryable: false }); await prepare(s); await s.page.getByText("Esta falha não permite nova tentativa com os mesmos documentos.").waitFor(); assert.equal(await s.page.getByRole("button", { name: "Tentar análise novamente" }).count(), 0); await s.context.close();
  });
  await check("direct completed processing URL redirects through GET without process", async () => {
    const s = await setup({ status: "completed" }); await s.open(`/comparisons/${fixture.id}/processing`); await s.page.waitForURL(`**/comparisons/${fixture.id}`); await s.page.getByText("Comparação concluída", { exact: true }).waitFor(); assert.equal(s.counters().processes, 0); await s.context.close();
  });
  await check("direct failed URL without cached retry metadata stays read-only", async () => {
    const s = await setup({ status: "failed" }); await s.open(`/comparisons/${fixture.id}/processing`); await s.page.getByText("A permissão de nova tentativa não está disponível nesta aba.", { exact: false }).waitFor(); assert.equal(s.counters().processes, 0); await s.context.close();
  });
  await check("Auth failure blocks product requests", async () => {
    authFailure = true; const s = await setup(); await s.open("/comparisons/new"); await s.page.getByRole("heading", { name: "Não foi possível iniciar sua sessão" }).waitFor({ timeout: 20000 }); assert.equal(s.calls.length, 0); authFailure = false; await s.context.close();
  });
} catch (error) { checks.push({ name: "browser run", status: "FAIL", error: error.message }); console.error(error); process.exitCode = 1; }
finally { writeFileSync(new URL("checks.json", output), JSON.stringify(checks, null, 2)); await browser?.close(); app.kill("SIGTERM"); auth.close(); }
