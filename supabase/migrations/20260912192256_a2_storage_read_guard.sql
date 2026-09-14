-- Defense against future permissive SELECT policies; other buckets unaffected.
-- Service role continues to bypass RLS; no grants or public URLs are added.
create policy quote_documents_read_owner_guard
on storage.objects as restrictive
for select to anon, authenticated
using (
  bucket_id <> 'quote-documents'
  or (storage.foldername(name))[1] = (select auth.uid())::text
);
