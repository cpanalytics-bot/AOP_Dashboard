-- Add "Sampled" to the Universe "School Types" breakdown.
-- Sampled = of a category's Active (deduped) schools, how many THIS employee
-- has a row for in sample_submissions_k8_ay_26_27 (per-employee match on email +
-- normalized school name). Bucket/category comes from the active universe, so a
-- school sampled but not in the active/de-aliased universe is not counted.
-- The frontend derives "LY Conversion %" = Sampled / User from this column.

-- 1. Breakdown view — add sampled_count.
create or replace view public.aop_src_universe_category_breakdown as
with ordered as (
  select distinct aop_norm_school(school_name) as nkey
  from public.order_form_k8_25_26
  where school_name is not null and school_name <> ''
), sampled as (
  select distinct lower(btrim(employee_email)) as em, aop_norm_school(school_name) as nkey
  from public.sample_submissions_k8_ay_26_27
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
  count(*) filter (where o.nkey is null) as non_user_count,
  count(*) filter (where sm.nkey is not null) as sampled_count
from base b
left join ordered o on o.nkey = b.nkey
left join sampled sm on sm.em = lower(btrim(b.employee_email)) and sm.nkey = b.nkey
group by b.employee_email, b.category;

-- 2. Snapshot cache — surface sampled_count in the per-category jsonb.
--    Matviews can't be CREATE OR REPLACE'd, so drop + recreate + reindex.
drop materialized view if exists public.aop_snapshot_cache;
create materialized view public.aop_snapshot_cache as
with emails as (
  select employee_email as email from aop_src_revenue_ly
  union select employee_email from aop_src_universe_counts
  union select employee_email from aop_src_universe_category_breakdown
), aov as (
  select lower(btrim(orders_agg.employee_email_id)) as em,
    round(sum(orders_agg.order_amount / nullif(orders_agg.sku_count, 0)::numeric)
          / nullif(count(distinct orders_agg.school_name), 0)::numeric, 2) as aov
  from orders_agg
  where orders_agg.school_name is not null and btrim(orders_agg.school_name) <> ''
    and orders_agg.school_name <> 'SCHOOL NOT KNOWN - BULK ORDER'
    and coalesce(orders_agg.status, '') !~~* '%cancel%'
  group by lower(btrim(orders_agg.employee_email_id))
), cats as (
  select aop_src_universe_category_breakdown.employee_email,
    jsonb_agg(jsonb_build_object(
      'category', aop_src_universe_category_breakdown.category,
      'current_count', aop_src_universe_category_breakdown.current_count,
      'active_count', aop_src_universe_category_breakdown.active_count,
      'user_count', aop_src_universe_category_breakdown.user_count,
      'sampled_count', aop_src_universe_category_breakdown.sampled_count)) as arr
  from aop_src_universe_category_breakdown
  group by aop_src_universe_category_breakdown.employee_email
)
select em.email as employee_email,
  jsonb_build_object('revenue',
    case when r.employee_email is null then null::jsonb
         else to_jsonb(r.*) || jsonb_build_object('current_aov', coalesce(a.aov, r.current_aov)) end,
    'aov', a.aov, 'universe',
    case when u.employee_email is null then null::jsonb else to_jsonb(u.*) end,
    'chain', coalesce(ch.chain_schools, 0::bigint),
    'ytd', coalesce(yt.ytd_actual, 0::numeric),
    'categories', coalesce(c.arr, '[]'::jsonb)) as snapshot
from emails em
  left join aop_src_revenue_ly r on r.employee_email = em.email
  left join aop_src_universe_counts u on u.employee_email = em.email
  left join aop_src_chain_schools ch on ch.employee_email = em.email
  left join aop_src_ytd_actual yt on yt.employee_email = em.email
  left join aov a on a.em = lower(em.email)
  left join cats c on c.employee_email = em.email;

create unique index aop_snapshot_cache_email on public.aop_snapshot_cache using btree (employee_email);
