-- 0007_storage.sql
-- Private bucket for supplier budget documents. Bucket name is centralized
-- here and in src/core/storage/bucket.ts (single source of truth) - never
-- inlined as a magic string elsewhere.
--
-- Path contract (enforced by the API, mirrored here for policy checks):
--   <ownerId>/<comparisonId>/<documentId>/<sanitizedFileName>
-- storage.foldername(name) splits the object path by '/', so
-- (storage.foldername(name))[1] is the owner segment.

insert into storage.buckets (id, name, public)
values ('quote-documents', 'quote-documents', false)
on conflict (id) do nothing;

-- Defense in depth: explicitly disallow anonymous/public buckets from being
-- toggled public later without this migration file changing.
update storage.buckets set public = false where id = 'quote-documents';

create policy quote_documents_storage_select_own
  on storage.objects for select
  using (
    bucket_id = 'quote-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy quote_documents_storage_insert_own
  on storage.objects for insert
  with check (
    bucket_id = 'quote-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy quote_documents_storage_update_own
  on storage.objects for update
  using (
    bucket_id = 'quote-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'quote-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy quote_documents_storage_delete_own
  on storage.objects for delete
  using (
    bucket_id = 'quote-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
