-- 0003_comparisons.sql
-- comparisons: the root aggregate owned by an anonymous (or future non-anonymous)
-- Supabase auth user. Result and error_code stay null until Agent C/B populate
-- them; the Foundation never fabricates values for these fields.

create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  status text not null default 'draft'
    constraint comparisons_status_check
    check (status in ('draft', 'processing', 'completed', 'failed')),
  result jsonb null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Required so quote_documents and comparison_feedback can enforce, at the
  -- database level, that a child row's owner_id always matches the parent
  -- comparison's owner_id (composite foreign key, see migrations 0004/0005).
  constraint comparisons_id_owner_unique unique (id, owner_id)
);

comment on table public.comparisons is
  'Root aggregate for a price-comparison request. Populated fully by Agent A; result/status transitions beyond draft belong to Agent B/C.';
comment on column public.comparisons.result is
  'Null until Agent C produces a real comparison result. Never set to {} or any placeholder value.';

create index comparisons_owner_id_idx on public.comparisons (owner_id);
create index comparisons_owner_created_idx on public.comparisons (owner_id, created_at desc);

create trigger comparisons_set_updated_at
  before update on public.comparisons
  for each row
  execute function public.set_updated_at();
