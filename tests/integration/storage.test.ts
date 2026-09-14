import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { backend, env, createAnonymousUserClient, trackStoragePath } from "./helpers";
import { QUOTE_DOCUMENTS_BUCKET as BUCKET } from "@/core/storage/bucket";
const bytes = new TextEncoder().encode("%PDF-1.7 fixture");
const pathFor = (owner: string) => `${owner}/${randomUUID()}/${randomUUID()}/quote.pdf`;

describe("real private Storage", () => {
  it("backend uploads, A reads A, B cannot read A, and no public URL works", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    const path = pathFor(a.userId);
    const { error: uploadError } = await backend.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" });
    expect(uploadError).toBeNull(); trackStoragePath(path);
    const own = await a.client.storage.from(BUCKET).download(path);
    expect(own.error).toBeNull(); expect(await own.data!.text()).toBe(new TextDecoder().decode(bytes));
    const other = await b.client.storage.from(BUCKET).download(path);
    expect(other.error).not.toBeNull(); expect(other.data).toBeNull();
    const publicResponse = await fetch(`${env.url}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(publicResponse.ok).toBe(false);
  });
  it("browser cannot upload to its own prefix, someone else's prefix or mint an upload URL", async () => {
    const a = await createAnonymousUserClient(); const b = await createAnonymousUserClient();
    for (const owner of [a.userId, b.userId]) {
      const path = pathFor(owner);
      const upload = await a.client.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" });
      expect(upload.error).not.toBeNull();
      const sign = await a.client.storage.from(BUCKET).createSignedUploadUrl(path);
      expect(sign.error).not.toBeNull();
      const object = await backend.storage.from(BUCKET).download(path);
      expect(object.data).toBeNull(); expect(object.error).not.toBeNull();
    }
  });
  it("browser cannot replace, upsert, move, copy or delete its own existing upload", async () => {
    const a = await createAnonymousUserClient(); const path = pathFor(a.userId);
    const fixture = await backend.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" });
    expect(fixture.error).toBeNull(); trackStoragePath(path);
    const bucket = a.client.storage.from(BUCKET);
    const changed = new TextEncoder().encode("%PDF-1.7 forged");
    expect((await bucket.update(path, changed, { contentType: "application/pdf" })).error).not.toBeNull();
    expect((await bucket.upload(path, changed, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    for (const action of ["move", "copy"] as const) {
      const destination = pathFor(a.userId);
      const result = await bucket[action](path, destination);
      expect(result.error).not.toBeNull();
      expect((await backend.storage.from(BUCKET).download(destination)).data).toBeNull();
    }
    await bucket.remove([path]); // DELETE can be a no-op without an HTTP error.
    const persisted = await backend.storage.from(BUCKET).download(path);
    expect(persisted.error).toBeNull(); expect(await persisted.data!.text()).toBe(new TextDecoder().decode(bytes));
  });
  it("bucket natively rejects unsupported MIME and >10 MiB even through backend upload", async () => {
    const a = await createAnonymousUserClient();
    const badType = await backend.storage.from(BUCKET).upload(pathFor(a.userId), bytes, { contentType: "text/html" });
    expect(badType.error).not.toBeNull();
    const large = await backend.storage.from(BUCKET).upload(pathFor(a.userId), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "application/pdf" });
    expect(large.error).not.toBeNull();
    const bucket = await backend.storage.getBucket(BUCKET);
    expect(bucket.error).toBeNull(); expect(bucket.data?.public).toBe(false);
    expect(Number(bucket.data?.file_size_limit)).toBe(10485760);
    expect(bucket.data?.allowed_mime_types?.sort()).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  });
});
