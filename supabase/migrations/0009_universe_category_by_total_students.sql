-- Universe "School Types" categorisation corrected: classify by UDISE
-- total student enrolment (en_total_students, already enriched onto each
-- universe row) instead of the pre-assigned school_category label.
-- "Uncategorized" -> "Unknown" (no student data).
--
--   A  > 1500 students      C  500–1000
--   B  1001–1500            D  1–499        Unknown  no data
--
-- Active = status 'Active'; User = school has matched orders.
-- Depends on: lvt_universe_data_school_selector, order_form_k8_25_26,
-- aop_norm_school(), aop_snapshot_cache (refreshed at the end).

-- 1. Allow the new 'Unknown' label (superset — keeps old values, rejects nothing).
alter table public.aop_universe_category drop constraint if exists aop_universe_category_category_check;
alter table public.aop_universe_category add constraint aop_universe_category_category_check
  check (category = any (array['A','B','C','D','Uncategorized','Unknown','Chain']));

-- 2. Recompute the breakdown from en_total_students.
create or replace view public.aop_src_universe_category_breakdown as
with ordered as (
  select distinct aop_norm_school(school_name) as nkey
  from public.order_form_k8_25_26
  where school_name is not null and school_name <> ''
), base as (
  select s.employee_email,
    case when btrim(coalesce(s.en_total_students,'')) ~ '^[0-9]+$'
         then btrim(s.en_total_students)::int else null end as total_students,
    s.status,
    aop_norm_school(s.school_name) as nkey
  from public.lvt_universe_data_school_selector s
  where s.employee_email is not null and s.employee_email <> ''
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
  count(*) filter (where b.status = 'Active') as active_count,
  count(*) filter (where o.nkey is not null) as user_count,
  count(*) filter (where o.nkey is null) as non_user_count
from base b
left join ordered o on o.nkey = b.nkey
group by b.employee_email, 2;

-- 3. Recompute the snapshot cache so members see the new categories.
refresh materialized view public.aop_snapshot_cache;
