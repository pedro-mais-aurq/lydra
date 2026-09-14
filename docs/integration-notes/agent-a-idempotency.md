# Agent A — Idempotency

The contract requires idempotency (section 29) but forbids inventing new
persistent contract structures (e.g. `idempotency_key`, a request log table)
to achieve it, since that would mean altering the frozen schema/API surface
without an integrator decision.

## What is implemented

- **POST /api/comparisons**: not idempotent under literal HTTP replay (two
  identical POSTs create two distinct `draft` comparisons, each with a new
  UUID). This mirrors normal REST "create" semantics and is the same
  trade-off most systems make when no client-supplied idempotency key exists
  in the contract. No partial state is ever left behind by a single call: the
  insert either fully succeeds or fully fails.
- **POST /api/comparisons/:id/documents**: not idempotent under literal HTTP
  replay either (two identical uploads of the same file create two distinct
  `quote_documents` rows and two distinct Storage objects, each under its own
  freshly generated `documentId`). What IS guaranteed:
  - If the Storage write fails, no DB row is created. If the DB write fails
    after a successful Storage write, deletion is attempted best-effort.
    A failed deletion can leave an orphan; it is logged without masking the
    original DB error. Storage and PostgreSQL are not one atomic transaction.
  - The max-4-documents guard (migration `0008`, reinforced by A.1) is safe under concurrent
    replay/retries: two simultaneous requests for the same comparison cannot
    both succeed past the limit, because the trigger writes/locks the parent
    `comparisons` row before counting. Document identity is immutable.

## Limitation

True request-level idempotency (a replayed POST returning the *same* row
instead of creating a new one) would require either:
- a client-supplied idempotency key column persisted per request, or
- content-hash based deduplication (`file_hash`), which the contract
  explicitly forbids inventing (section 31).

Neither is implemented in this round. If a future round needs strict
replay-safety (e.g. for a flaky-network retry button in the UI), that
requires an integrator decision to extend the contract with an idempotency
key column - it should not be improvised unilaterally by any single agent.

## Mitigation available today without a contract change

- Clients can call `GET /api/comparisons` before retrying `POST
  /api/comparisons` to check whether a similarly-titled draft already exists,
  and choose not to resubmit. This is a UX-layer mitigation, not a backend
  guarantee.
