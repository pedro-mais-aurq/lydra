-- A.1: session credentials can read their own rows, never mutate the domain.
-- Explicit grants work on both existing and clean Supabase installations.
begin;

revoke all privileges on table public.comparisons, public.quote_documents,
  public.comparison_feedback from public, anon, authenticated;
grant select on table public.comparisons, public.quote_documents,
  public.comparison_feedback to authenticated;
grant select, insert, update, delete on table public.comparisons,
  public.quote_documents, public.comparison_feedback to service_role;

drop policy comparisons_insert_own on public.comparisons;
drop policy comparisons_update_own on public.comparisons;
drop policy comparisons_delete_own on public.comparisons;
drop policy quote_documents_insert_own on public.quote_documents;
drop policy quote_documents_update_own on public.quote_documents;
drop policy quote_documents_delete_own on public.quote_documents;
drop policy comparison_feedback_insert_own on public.comparison_feedback;
drop policy comparison_feedback_update_own on public.comparison_feedback;
drop policy comparison_feedback_delete_own on public.comparison_feedback;

alter policy comparisons_select_own on public.comparisons
  to authenticated using (owner_id = (select auth.uid()));
alter policy quote_documents_select_own on public.quote_documents
  to authenticated using (owner_id = (select auth.uid()));
alter policy comparison_feedback_select_own on public.comparison_feedback
  to authenticated using (owner_id = (select auth.uid()));

-- Trigger functions are not browser RPC endpoints.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_max_documents_per_comparison() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.enforce_max_documents_per_comparison() to service_role;
alter function public.set_updated_at() set search_path = '';

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
where id = 'quote-documents';

drop policy quote_documents_storage_insert_own on storage.objects;
drop policy quote_documents_storage_update_own on storage.objects;
drop policy quote_documents_storage_delete_own on storage.objects;
alter policy quote_documents_storage_select_own on storage.objects
  to authenticated
  using (bucket_id = 'quote-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Restrictive policies also defeat unrelated permissive Storage policies that
-- might be added later. They leave other buckets unchanged. Backend bypasses RLS.
create policy quote_documents_storage_no_client_insert
  on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'quote-documents');
create policy quote_documents_storage_no_client_update
  on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'quote-documents') with check (bucket_id <> 'quote-documents');
create policy quote_documents_storage_no_client_delete
  on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'quote-documents');

commit;
