# Agent A — API Request/Response Shapes

The architectural contract fixes the domain schema, error codes, and error
envelope, but leaves a few operational request/response details
unformalized. This note documents the choices made for this round and why,
per contract section 3 ("escolha a solução mais estreita, simples e
retrocompatível possível... e documente a decisão").

## POST /api/comparisons - request body

Chosen shape:

```json
{ "title": "string, 1-200 chars" }
```

No other field is accepted. A `owner_id`/`ownerId` field, if sent, is
silently stripped by the Zod schema (`createComparisonSchema`) before
reaching any handler logic - never read, never honored. This is the
narrowest possible shape that satisfies the contract's only stated
requirement for this endpoint (create a `draft` comparison for the
authenticated owner).

## POST /api/comparisons/:id/documents - request shape

Chosen shape: `multipart/form-data` with a single field named `file`.

Rationale: this is the standard, narrowest way to upload binary content over
HTTP in a Next.js Route Handler without inventing a custom envelope (e.g.
base64-in-JSON, which would need ~33% more bytes and its own validation
path). If a future round needs additional per-upload metadata (e.g. a
client-declared display name distinct from the file's own name), it should
be added as an additional form field, not by replacing the shape below.

## Success response envelope

Chosen shape (applies to all four endpoints in this round):

```json
{ "data": { ... }, "requestId": "uuid" }
```

The contract only fixes the **error** envelope (section 24). The success
envelope above was chosen to mirror it structurally (a `requestId` alongside
a payload key) rather than returning the resource shape bare at the response
root, so that clients can rely on `requestId` being present at the same path
for both success and failure. This is a local Foundation decision, not a new
global contract; if B/C/D/E need a different shape, that needs an integrator
decision, not a silent divergence.

## GET /api/comparisons/:id - included documents

The detail response includes a `documents` array (the comparison's own
`quote_documents`, serialized) alongside the comparison fields, flattened
into a single object:

```json
{ "id": "...", "title": "...", "status": "draft", "...": "...", "documents": [...] }
```

This was judged "necessary for the already-defined flow" per contract
section 23 ("Pode retornar documentos... caso isso seja necessário para o
fluxo já definido"), since a client needs to know which documents already
exist to enforce the max-4 client-side before even attempting an upload.
Only fields with no extraction/comparison semantics are included per
document (see `serializeQuoteDocument`) - `extractedData` is passed through
as `null` in this round, never fabricated.
