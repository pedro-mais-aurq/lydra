-- Fail the reset gate if native grants/RLS, bucket restrictions or schema drift.
do $$
declare
  domain_table text;
  role_name text;
  t regclass;
begin
  foreach domain_table in array array['comparisons', 'quote_documents', 'comparison_feedback'] loop
    t := ('public.' || domain_table)::regclass;
    if not exists (select 1 from pg_class where oid = t and relrowsecurity and relforcerowsecurity) then
      raise exception 'Missing RLS on %', domain_table;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
      if has_table_privilege(role_name, t, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Browser write privilege remains: % on %', role_name, domain_table;
      end if;
    end loop;
    if not has_table_privilege('authenticated', t, 'SELECT') then
      raise exception 'Owner read grant missing on %', domain_table;
    end if;
    if has_table_privilege('anon', t, 'SELECT') then
      raise exception 'Unauthenticated read grant remains on %', domain_table;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = domain_table and cmd <> 'SELECT') then
      raise exception 'Mutation policy remains on %', domain_table;
    end if;
  end loop;
  if not exists (
    select 1 from storage.buckets where id = 'quote-documents' and not public
      and file_size_limit = 10485760
      and allowed_mime_types @> array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
      and cardinality(allowed_mime_types) = 4
  ) then raise exception 'Bucket configuration mismatch'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('quote_documents_storage_no_client_insert', 'quote_documents_storage_no_client_update', 'quote_documents_storage_no_client_delete')
      and permissive = 'RESTRICTIVE') <> 3 then
    raise exception 'Storage client mutation guards missing';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'quote_documents_read_owner_guard' and permissive = 'RESTRICTIVE' and cmd = 'SELECT') then
    raise exception 'Storage owner read guard missing';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.quote_documents'::regclass
      and attname = 'extraction_schema_version' and atttypid = 'integer'::regtype) then
    raise exception 'Extraction schema version is not numeric';
  end if;
  if exists (select 1 from pg_proc where oid in ('public.preserve_document_identity()'::regprocedure,
      'public.enforce_max_documents_per_comparison()'::regprocedure) and prosecdef) then
    raise exception 'Unexpected security definer';
  end if;
end;
$$;
