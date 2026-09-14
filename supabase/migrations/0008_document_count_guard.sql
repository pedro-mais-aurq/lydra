-- 0008_document_count_guard.sql
-- Enforces "max 4 documents per comparison" (contract section 18) in a way
-- that is safe under concurrent uploads. A naive "SELECT count(*) then
-- INSERT" from the application has a race: two simultaneous requests can
-- both read count=3 and both insert, producing 5 documents.
--
-- This trigger closes that race by locking the parent `comparisons` row
-- (SELECT ... FOR UPDATE) before counting. Concurrent inserts for the same
-- comparison_id serialize on that row lock, so the count each transaction
-- sees is authoritative at commit time. A plain CHECK constraint cannot
-- express a cross-row count, which is why a trigger is used here instead of
-- a simple constraint (contract section 30 prefers constraints, but this is
-- exactly the case that requires a trigger).

create or replace function public.enforce_max_documents_per_comparison()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
  max_documents constant integer := 4;
begin
  -- Lock the parent comparison row for the duration of this transaction,
  -- serializing concurrent inserts against the same comparison_id.
  perform 1 from public.comparisons where id = new.comparison_id for update;

  select count(*) into current_count
  from public.quote_documents
  where comparison_id = new.comparison_id;

  if current_count >= max_documents then
    raise exception 'TOO_MANY_DOCUMENTS'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger quote_documents_enforce_max_count
  before insert on public.quote_documents
  for each row
  execute function public.enforce_max_documents_per_comparison();
