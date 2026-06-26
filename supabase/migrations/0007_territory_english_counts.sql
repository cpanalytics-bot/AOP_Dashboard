-- English-medium school counts shown in the Edit Profile State / District / Block
-- pickers as "(N schools)".
--
-- The district/block RPCs filter all_india_schools to the selected parent BEFORE
-- grouping: an unfiltered full-table aggregate over ~248k wide rows takes seconds
-- and blew past the anon (PostgREST) statement timeout, returning 500. States have
-- no parent to pre-filter on, so they are precomputed into a small lookup table.
--
-- Depends on pre-existing tables: public.all_india_schools, public.aop_geo.

create index if not exists all_india_schools_state_lower_idx
  on public.all_india_schools (lower(btrim(state)));
create index if not exists all_india_schools_district_lower_idx
  on public.all_india_schools (lower(btrim(district)));

-- Districts for the selected state(s), English-medium count per district.
create or replace function public.aop_districts_with_english_count(p_states text[])
returns table(district text, english_count integer)
language sql stable security definer set search_path to 'public'
as $function$
  with sl as (select distinct lower(btrim(x)) as st from unnest(p_states) x),
  eng as (
    select lower(btrim(s.state)) as st, lower(btrim(s.district)) as dist,
           count(*) filter (
             where s.medium_1 = '19-English' or s.medium_2 = '19-English'
                or s.medium_3 = '19-English' or s.medium_4 = '19-English'
           ) as english_count
    from public.all_india_schools s
    where lower(btrim(s.state)) in (select st from sl)   -- filter FIRST
    group by 1, 2
  ),
  geo as (
    select distinct g.state, g.district from public.aop_geo g
    where g.district is not null and lower(g.state) = any (select st from sl)
  )
  select geo.district, coalesce(eng.english_count, 0)::int as english_count
  from geo
  left join eng on eng.st = lower(btrim(geo.state)) and eng.dist = lower(btrim(geo.district))
  order by geo.district;
$function$;

-- Blocks for the selected district(s), English-medium count per block (summed
-- across any districts that share a block name, matching the DISTINCT dropdown).
create or replace function public.aop_blocks_with_english_count(p_districts text[])
returns table(block text, english_count integer)
language sql stable security definer set search_path to 'public'
as $function$
  with dl as (select distinct lower(btrim(x)) as dist from unnest(p_districts) x),
  eng as (
    select lower(btrim(s.district)) as dist, lower(btrim(s.block)) as blk,
           count(*) filter (
             where s.medium_1 = '19-English' or s.medium_2 = '19-English'
                or s.medium_3 = '19-English' or s.medium_4 = '19-English'
           ) as english_count
    from public.all_india_schools s
    where s.block is not null and lower(btrim(s.district)) in (select dist from dl)   -- filter FIRST
    group by 1, 2
  ),
  geo as (
    select distinct g.district, g.block from public.aop_geo g
    where g.block is not null and lower(g.district) = any (select dist from dl)
  )
  select geo.block, coalesce(sum(eng.english_count), 0)::int as english_count
  from geo
  left join eng on eng.dist = lower(btrim(geo.district)) and eng.blk = lower(btrim(geo.block))
  group by geo.block
  order by geo.block;
$function$;

-- States: precomputed lookup (a live GROUP BY over all_india_schools is ~3.7s).
create table if not exists public.aop_state_english_count (
  st text primary key,
  english_count integer not null default 0
);
insert into public.aop_state_english_count (st, english_count)
select lower(btrim(state)),
       count(*) filter (
         where medium_1='19-English' or medium_2='19-English'
            or medium_3='19-English' or medium_4='19-English')
from public.all_india_schools where state is not null
group by 1
on conflict (st) do update set english_count = excluded.english_count;

create or replace function public.aop_states_with_english_count()
returns table(state text, english_count integer)
language sql stable security definer set search_path to 'public'
as $function$
  select g.state, coalesce(c.english_count, 0)::int as english_count
  from (select distinct state from public.aop_geo where state is not null) g
  left join public.aop_state_english_count c on c.st = lower(btrim(g.state))
  order by g.state;
$function$;

grant execute on function public.aop_districts_with_english_count(text[]) to anon, authenticated;
grant execute on function public.aop_blocks_with_english_count(text[]) to anon, authenticated;
grant execute on function public.aop_states_with_english_count() to anon, authenticated;
