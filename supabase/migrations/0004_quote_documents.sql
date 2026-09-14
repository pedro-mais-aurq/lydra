-- 0004_quote_documents.sql
-- quote_documents: uploaded budget documents belonging to a comparison.
--
-- CROSS-OWNER INTEGRITY (contract section 10):
-- A plain `comparison_id references comparisons(id)` foreign key would allow
-- inserting a document with owner_id = A while comparison_id points to a
-- comparison owned by B (owner_id is just another column, unchecked by that
-- FK). To make that structurally impossible in Postgres itself, we:
--   1. Gave `comparisons` a UNIQUE (id, owner_id) constraint (migration 0003).
--   2. Declare the FK here as a *composite* key: (comparison_id, owner_id)
--      references comparisons (id, owner_id).
-- This forces owner_id on the document to equal the owner_id of the
-- comparison it references, or the insert/update is rejected by Postgres
-- regardless of RLS, application code, or a direct SQL session.

create table public.quote_documents (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null
    constraint quote_documents_size_positive check (size_bytes > 0),
  status text not null default 'uploaded'
    constraint quote_documents_status_check
    check (status in ('uploaded', 'processing', 'completed', 'failed')),
  extracted_data jsonb null,
  extraction_schema_version text null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quote_documents_storage_path_unique unique (storage_path),

  constraint quote_documents_comparison_owner_fk
    foreign key (comparison_id, owner_id)
    references public.comparisons (id, owner_id)
    on delete cascade
);

comment on table public.quote_documents is
  'Uploaded supplier budget documents. extracted_data/extraction_schema_version are populated only by Agent B; Agent A leaves them null.';
comment on constraint quote_documents_comparison_owner_fk on public.quote_documents is
  'Structural guarantee: a document can only reference a comparison owned by the same owner_id as the document itself.';

create index quote_documents_comparison_id_idx on public.quote_documents (comparison_id);
create index quote_documents_owner_id_idx on public.quote_documents (owner_id);

create trigger quote_documents_set_updated_at
  before update on public.quote_documents
  for each row
  execute function public.set_updated_at();
