-- Bucket Universe "School Types" by the stored school_category label
-- (A/B/C/D, blank -> 'Unknown'), matching the K8 dashboard MV
-- (mv_k8_school_pipeline) letter-for-letter. This supersedes the total_students
-- CASE from migration 0009. Active + alias-deduped scope (0010) retained.
create or replace view public.aop_src_universe_category_breakdown as
with ordered as (
  select distinct aop_norm_school(school_name) as nkey
  from public.order_form_k8_25_26
  where school_name is not null and school_name <> ''
), base as (
  select s.employee_email,
    coalesce(nullif(btrim(s.school_category),''),'Unknown') as category,
    aop_norm_school(s.school_name) as nkey
  from public.lvt_universe_data_school_selector s
  left join public.k8_school_aliases ua
    on lower(btrim(s.school_name)) = lower(btrim(ua.alias_name))
  where s.employee_email is not null and s.employee_email <> ''
    and s.status = 'Active' and ua.alias_name is null
)
select b.employee_email, b.category,
  count(*) as current_count,
  count(*) as active_count,
  count(*) filter (where o.nkey is not null) as user_count,
  count(*) filter (where o.nkey is null) as non_user_count
from base b
left join ordered o on o.nkey = b.nkey
group by b.employee_email, b.category;

refresh materialized view public.aop_snapshot_cache;
