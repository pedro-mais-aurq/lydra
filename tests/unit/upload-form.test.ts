import { expect, it } from "vitest";
import { MAX_UPLOAD_BODY_BYTES, readUploadForm } from "@/core/validation/upload-form";
it.each([undefined, "1"])("bounds streamed body even with Content-Length %s", async (length) => {
  const headers = new Headers({ "content-type": "multipart/form-data; boundary=test" });
  if (length) headers.set("content-length", length);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_UPLOAD_BODY_BYTES + 1)); controller.close(); } });
  const init: RequestInit & { duplex: string } = { method: "POST", headers, body: stream, duplex: "half" };
  await expect(readUploadForm(new Request("http://localhost", init))).rejects.toMatchObject({ code: "FILE_TOO_LARGE", status: 413 });
});
