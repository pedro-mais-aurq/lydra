-- A.1: preserve the original eight migrations; validate existing data without
-- discarding documents or inventing extraction values. Incompatible data aborts.
begin;
lock table public.comparisons, public.quote_documents in share row exclusive mode;

do $$
begin
  if exists (select 1 from public.quote_documents group by comparison_id having count(*) > 4) then
    raise exception 'A1_EXISTING_COMPARISON_EXCEEDS_DOCUMENT_LIMIT';
  end if;
end;
$$;

alter table public.quote_documents
  alter column extraction_schema_version type integer
  using extraction_schema_version::integer;

alter table public.quote_documents add constraint quote_documents_extraction_version_check
  check ((
    (extracted_data is null and extraction_schema_version is null)
    or (extracted_data is not null and extraction_schema_version = 1
      and jsonb_typeof(extracted_data) = 'object'
      and extracted_data -> 'schemaVersion' = '1'::jsonb)
  ) is true);

-- Existing API paths already contain the sanitized name; reconcile metadata.
update public.quote_documents
set file_name = regexp_replace(storage_path, '^.*/', '')
where file_name is distinct from regexp_replace(storage_path, '^.*/', '');

alter table public.quote_documents
  add constraint quote_documents_size_limit_check check (size_bytes <= 10485760),
  add constraint quote_documents_mime_check check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  add constraint quote_documents_safe_filename_check check (
    file_name ~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$' and strpos(file_name, '..') = 0
  ),
  add constraint quote_documents_canonical_path_check check (
    storage_path = owner_id::text || '/' || comparison_id::text || '/' || id::text || '/' || file_name
  );

create or replace function public.enforce_max_documents_per_comparison()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
  comparison_state text;
begin
  -- An actual parent-row write serializes inserts and also produces a write
  -- conflict under REPEATABLE READ/SERIALIZABLE (a plain row lock is insufficient
  -- when a competing transaction holds an older snapshot).
  update public.comparisons set updated_at = updated_at
  where id = new.comparison_id
  returning status into comparison_state;

  if not found then return new; end if; -- Let the existing FK reject absence.
  if comparison_state <> 'draft' then
    raise exception 'INVALID_COMPARISON_STATE' using errcode = 'P0001';
  end if;

  select count(*) into current_count from public.quote_documents
  where comparison_id = new.comparison_id;
  if current_count >= 4 then
    raise exception 'TOO_MANY_DOCUMENTS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Moving an upload would also invalidate its canonical Storage path. The MVP
-- exposes no move operation: keep identity immutable even for backend writes.
create function public.preserve_document_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.comparison_id is distinct from old.comparison_id
    or new.owner_id is distinct from old.owner_id
    or new.storage_path is distinct from old.storage_path then
    raise exception 'DOCUMENT_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.preserve_document_identity() from public, anon, authenticated;
grant execute on function public.preserve_document_identity() to service_role;
create trigger quote_documents_preserve_identity
  before update of id, comparison_id, owner_id, storage_path on public.quote_documents
  for each row execute function public.preserve_document_identity();

commit;
