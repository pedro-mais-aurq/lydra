import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll } from "vitest";
import { QUOTE_DOCUMENTS_BUCKET } from "@/core/storage/bucket";

/** Deliberately fail at collection if mandatory local infrastructure is absent.
 * Fixtures use backend privileges; authenticated users are read-only domain clients.
 */
function requireIntegrationEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error("INTEGRATION_INFRASTRUCTURE_REQUIRED: run supabase start, npm run test:migrations, then node scripts/run-local-integration.mjs. No security tests were validated.");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Integration tests only accept a disposable LOCAL Supabase instance.");
  }
  return { url, anonKey, serviceKey };
}
export const env = requireIntegrationEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export const backend = createClient(env.url, env.serviceKey, options);
const users: string[] = [];
const objects: string[] = [];
export function trackStoragePath(path: string) { objects.push(path); }

export async function createAnonymousUserClient(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(env.url, env.anonKey, options);
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Local anonymous Auth failed: ${error?.message}`);
  users.push(data.user.id);
  return { client, userId: data.user.id };
}
export async function createComparisonFixture(ownerId: string, title = "fixture") {
  const { data, error } = await backend.from("comparisons").insert({ owner_id: ownerId, title }).select().single();
  if (error || !data) throw new Error(`Comparison fixture failed: ${error?.message}`);
  return data as { id: string; owner_id: string; title: string; status: "draft"; result: null };
}
export function documentInput(ownerId: string, comparisonId: string) {
  const id = randomUUID();
  return { id, comparison_id: comparisonId, owner_id: ownerId, file_name: "quote.pdf", storage_path: `${ownerId}/${comparisonId}/${id}/quote.pdf`, mime_type: "application/pdf", size_bytes: 100 };
}
export async function createDocumentFixture(ownerId: string, comparisonId: string) {
  const input = documentInput(ownerId, comparisonId);
  const { error } = await backend.from("quote_documents").insert(input);
  if (error) throw new Error(`Document fixture failed: ${error.message}`);
  return input;
}

afterAll(async () => {
  if (objects.length) {
    const { error } = await backend.storage.from(QUOTE_DOCUMENTS_BUCKET).remove(objects);
    if (error) throw new Error(`Fixture Storage cleanup failed: ${error.message}`);
  }
  for (const userId of users) {
    const { error } = await backend.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Fixture user cleanup failed: ${error.message}`);
  }
});
