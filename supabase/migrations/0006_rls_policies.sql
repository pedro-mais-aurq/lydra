-- 0006_rls_policies.sql
-- Owner-only RLS on all three domain tables. RLS is the last line of defense;
-- application code must never rely solely on this, but it must never be
-- bypassable through it either. USING governs visibility for
-- SELECT/UPDATE/DELETE targets; WITH CHECK governs values being written by
-- INSERT/UPDATE.

alter table public.comparisons enable row level security;
alter table public.quote_documents enable row level security;
alter table public.comparison_feedback enable row level security;

-- Defense in depth: even if RLS were ever misconfigured or bypassed by a
-- future migration, force it for table owners too (no superuser shortcut in
-- normal application connections).
alter table public.comparisons force row level security;
alter table public.quote_documents force row level security;
alter table public.comparison_feedback force row level security;

-- comparisons ---------------------------------------------------------------

create policy comparisons_select_own
  on public.comparisons for select
  using (owner_id = auth.uid());

create policy comparisons_insert_own
  on public.comparisons for insert
  with check (owner_id = auth.uid());

create policy comparisons_update_own
  on public.comparisons for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy comparisons_delete_own
  on public.comparisons for delete
  using (owner_id = auth.uid());

-- quote_documents -------------------------------------------------------------

create policy quote_documents_select_own
  on public.quote_documents for select
  using (owner_id = auth.uid());

create policy quote_documents_insert_own
  on public.quote_documents for insert
  with check (owner_id = auth.uid());

create policy quote_documents_update_own
  on public.quote_documents for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy quote_documents_delete_own
  on public.quote_documents for delete
  using (owner_id = auth.uid());

-- comparison_feedback ---------------------------------------------------------

create policy comparison_feedback_select_own
  on public.comparison_feedback for select
  using (owner_id = auth.uid());

create policy comparison_feedback_insert_own
  on public.comparison_feedback for insert
  with check (owner_id = auth.uid());

create policy comparison_feedback_update_own
  on public.comparison_feedback for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy comparison_feedback_delete_own
  on public.comparison_feedback for delete
  using (owner_id = auth.uid());
