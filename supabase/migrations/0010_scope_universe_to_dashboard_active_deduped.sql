-- Scope the AOP universe (School Types breakdown + "Schools In Your Area Today"
-- counts) to the SAME set the K8 dashboard MV (mv_k8_school_pipeline) uses:
--   * only Active schools          (status = 'Active')
--   * drop alias duplicates        (anti-join on k8_school_aliases)
-- so the AOP numbers reconcile with the dashboard (~20,188 active+deduped),
-- not the raw lvt_universe_data_school_selector (~23,983, incl. inactive + aliases).
-- Categorisation stays by UDISE total_students (see 0009).
--
-- Note: with the universe scoped to active-only, total_schools == active_schools.

-- 1. School Types breakdown.
create or replace view public.aop_src_universe_category_breakdown as
with ordered as (
  select distinct aop_norm_school(school_name) as nkey
  from public.order_form_k8_25_26
  where school_name is not null and school_name <> ''
), base as (
  select s.employee_email,
    case when btrim(coalesce(s.en_total_students,'')) ~ '^[0-9]+$'
         then btrim(s.en_total_students)::int else null end as total_students,
    aop_norm_school(s.school_name) as nkey
  from public.lvt_universe_data_school_selector s
  left join public.k8_school_aliases ua
    on lower(btrim(s.school_name)) = lower(btrim(ua.alias_name))
  where s.employee_email is not null and s.employee_email <> ''
    and s.status = 'Active' and ua.alias_name is null
)
select b.employee_email,
  case
    when b.total_students > 1500 then 'A'
    when b.total_students > 1000 then 'B'
    when b.total_students >= 500 then 'C'
    when b.total_students > 0    then 'D'
    else 'Unknown'
  end as category,
  count(*) as current_count,
  count(*) as active_count,
  count(*) filter (where o.nkey is not null) as user_count,
  count(*) filter (where o.nkey is null) as non_user_count
from base b
left join ordered o on o.nkey = b.nkey
group by b.employee_email, 2;

-- 2. "Schools In Your Area Today" counts.
create or replace view public.aop_src_universe_counts as
with ordered as (
  select distinct aop_norm_school(school_name) as nkey
  from public.order_form_k8_25_26
  where school_name is not null and school_name <> ''
), base as (
  select s.employee_email, aop_norm_school(s.school_name) as nkey
  from public.lvt_universe_data_school_selector s
  left join public.k8_school_aliases ua
    on lower(btrim(s.school_name)) = lower(btrim(ua.alias_name))
  where s.employee_email is not null and s.employee_email <> ''
    and s.status = 'Active' and ua.alias_name is null
)
select b.employee_email,
  count(*) as total_schools,
  count(*) as active_schools,
  count(*) filter (where o.nkey is not null) as user_schools,
  count(*) filter (where o.nkey is null) as non_user_schools
from base b
left join ordered o on o.nkey = b.nkey
group by b.employee_email;

-- 3. Recompute the snapshot cache.
refresh materialized view public.aop_snapshot_cache;
