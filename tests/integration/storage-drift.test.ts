import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { backend, createAnonymousUserClient, trackStoragePath } from "./helpers";

// The deliberately broad policy is visible only in this transaction and always
// rolls back. The SQL connection reuses real Auth/Storage fixtures created via API.
describe("restrictive SELECT survives permissive policy drift", () => {
  it("owner still reads and cross-owner is denied with USING (true)", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const path = `${a.userId}/${randomUUID()}/${randomUUID()}/quote.pdf`;
    expect((await backend.storage.from("quote-documents").upload(path, new TextEncoder().encode("%PDF-1.7"), { contentType: "application/pdf" })).error).toBeNull();
    trackStoragePath(path);
    // All substitutions are generated UUIDs, never browser input.
    for (const id of [a.userId, b.userId]) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const sql = `begin;
      create policy a2_test_permissive_drift on storage.objects for select to authenticated using (true);
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${a.userId}', true);
      do $$ begin if (select count(*) from storage.objects where bucket_id='quote-documents' and name='${path}') <> 1 then raise exception 'Owner download denied'; end if; end $$;
      select set_config('request.jwt.claim.sub', '${b.userId}', true);
      do $$ begin if exists(select 1 from storage.objects where bucket_id='quote-documents' and name='${path}') then raise exception 'Cross-owner policy drift leak'; end if; end $$;
      rollback;`;
    const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--local", sql], { encoding: "utf8", timeout: 20000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });
});
