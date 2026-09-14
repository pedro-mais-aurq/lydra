-- 0002_updated_at_trigger.sql
-- Generic trigger function to keep `updated_at` current on row updates.
-- Shared by all tables that carry an updated_at column.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
