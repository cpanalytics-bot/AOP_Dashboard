-- Consolidate AOP hiring requests into k8_hiring (single source of truth).
-- k8_hiring holds BOTH the HR recruitment pipeline (source='HR_SYNC', fed by the
-- external sync) and the ZM's AOP planning requests (source='AOP').
-- All additions are nullable / defaulted so the external HR sync and existing
-- rows are unaffected.

-- 1. Stable surrogate key
alter table public.k8_hiring add column if not exists id uuid not null default gen_random_uuid();
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.k8_hiring'::regclass and contype = 'p'
  ) then
    alter table public.k8_hiring add primary key (id);
  end if;
end $$;

-- 2. AOP planning columns (filled by the ZM form; HR sync never touches these)
alter table public.k8_hiring
  add column if not exists source text not null default 'HR_SYNC',
  add column if not exists aop_ref text,
  add column if not exists aop_id uuid,
  add column if not exists zm_email text,
  add column if not exists for_employee_email text,
  add column if not exists districts text[],
  add column if not exists block text,
  add column if not exists number_of_positions integer,
  add column if not exists priority text,
  add column if not exists hiring_reason text,
  add column if not exists business_justification text,
  add column if not exists expected_revenue_impact numeric,
  add column if not exists hiring_timeline text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.k8_hiring set source = 'HR_SYNC' where source is null;

-- 3. aop_ref unique only when present (the shared key for AOP-origin rows; the
--    recruiter stamps this onto the HR requisition so the sync updates this row
--    in place instead of creating a duplicate)
create unique index if not exists k8_hiring_aop_ref_uidx
  on public.k8_hiring(aop_ref) where aop_ref is not null;

-- 4. Auto-stamp aop_ref on AOP rows + maintain updated_at
create sequence if not exists public.k8_aop_ref_seq;
create or replace function public.k8_hiring_stamp() returns trigger
language plpgsql as $$
begin
  if (new.source = 'AOP' and new.aop_ref is null) then
    new.aop_ref := 'AOP-' || lpad(nextval('public.k8_aop_ref_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists k8_hiring_stamp_ins on public.k8_hiring;
create trigger k8_hiring_stamp_ins before insert on public.k8_hiring
  for each row execute function public.k8_hiring_stamp();

drop trigger if exists k8_hiring_stamp_upd on public.k8_hiring;
create trigger k8_hiring_stamp_upd before update on public.k8_hiring
  for each row execute function public.k8_hiring_stamp();

-- 5. Allow the app (anon, like the existing select/insert policies) to update
drop policy if exists anon_update_k8_hiring on public.k8_hiring;
create policy anon_update_k8_hiring on public.k8_hiring
  for update to anon using (true) with check (true);

-- 6. Scoped read RPC: a ZM sees rows where they are the reporting_zm (by name,
--    resolved from emp_record) or rows they raised in AOP (zm_email).
create or replace function public.aop_k8_hiring(p_zm_email text)
returns setof public.k8_hiring
language sql security definer set search_path = public as $$
  select *
  from public.k8_hiring k
  where k.zm_email = p_zm_email
     or k.reporting_zm = (
        select e.zonal_manager from public.emp_record e
        where e.zonal_manager_email = p_zm_email
        limit 1)
  -- HR-sheet rows first (in their sheet order); AOP requests (no s_no) appended
  -- at the bottom in the order they were raised, so a new request shows last.
  order by k.s_no asc nulls last, k.created_at asc nulls last;
$$;
grant execute on function public.aop_k8_hiring(text) to anon, authenticated;
