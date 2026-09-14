-- 0005_comparison_feedback.sql
-- comparison_feedback: schema/constraints/RLS/storage only. No endpoint or
-- product rule is implemented against this table in this round (belongs to
-- Agent E). comparison_id is UNIQUE: at most one feedback row per comparison.
--
-- Same composite-FK pattern as quote_documents to make cross-owner feedback
-- structurally impossible (see migration 0004 for the full rationale).

create table public.comparison_feedback (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  useful boolean not null,
  accuracy text not null
    constraint comparison_feedback_accuracy_check
    check (accuracy in ('accurate', 'partial', 'inaccurate')),
  comments text null,
  created_at timestamptz not null default now(),

  constraint comparison_feedback_comparison_id_unique unique (comparison_id),

  constraint comparison_feedback_comparison_owner_fk
    foreign key (comparison_id, owner_id)
    references public.comparisons (id, owner_id)
    on delete cascade
);

comment on table public.comparison_feedback is
  'Schema, constraints and RLS only. Endpoint (POST /api/comparisons/:id/feedback) belongs to Agent E and is not implemented here.';

create index comparison_feedback_owner_id_idx on public.comparison_feedback (owner_id);
