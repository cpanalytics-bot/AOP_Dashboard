-- Enterprise redesign: zones, districts, blocks, employee assignments, ADMIN role, hiring refactor
-- Run after 0001_schema.sql and 0002_rls.sql

-- Extend role enum
alter type role_t add value if not exists 'ADMIN';

-- ---------------------------------------------------------------------------
-- Master data: zones, districts, blocks
-- ---------------------------------------------------------------------------
create table if not exists zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  collection_percent numeric(5,2) not null default 85,
  created_at timestamptz not null default now()
);

create table if not exists districts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  state text not null,
  zone_id uuid not null references zones(id),
  created_at timestamptz not null default now()
);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  district_id uuid not null references districts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_blocks_district on blocks(district_id);
create index if not exists idx_districts_zone on districts(zone_id);

-- ---------------------------------------------------------------------------
-- User profile changes
-- ---------------------------------------------------------------------------
alter table users add column if not exists zone_id uuid references zones(id);

create table if not exists employee_districts (
  user_id uuid not null references users(id) on delete cascade,
  district_id uuid not null references districts(id) on delete cascade,
  primary key (user_id, district_id)
);

-- ---------------------------------------------------------------------------
-- Hiring refactor
-- ---------------------------------------------------------------------------
alter table hiring_requests add column if not exists for_user_id uuid references users(id);

create table if not exists hiring_districts (
  hiring_request_id uuid not null references hiring_requests(id) on delete cascade,
  district_id uuid not null references districts(id),
  primary key (hiring_request_id, district_id)
);

-- ---------------------------------------------------------------------------
-- ZDM roll-up view (aggregates descendant AOPs for zone managers)
-- ---------------------------------------------------------------------------
create or replace view v_zdm_rollup_aop as
select
  mgr.id as zdm_user_id,
  m.fy,
  sum(r.total_revenue_target) as total_revenue_target,
  sum(u.active_schools) as active_schools,
  sum(u.new_school_acquisition_plan) as new_school_acquisition_plan,
  sum(inv.total_investment) as total_investment,
  count(*) filter (where m.status = 'approved') as approved_count,
  count(*) as team_count
from users mgr
join employee_hierarchy eh on eh.ancestor_id = mgr.id and eh.depth > 0
join aop_master m on m.user_id = eh.descendant_id
left join revenue_targets r on r.aop_id = m.id
left join universe_planning u on u.aop_id = m.id
left join investment_planning inv on inv.aop_id = m.id
where mgr.role = 'ZDM'
group by mgr.id, m.fy;

-- ---------------------------------------------------------------------------
-- Updated edit permission: only ZDM (and ADMIN) can write planning data
-- ---------------------------------------------------------------------------
create or replace function can_edit_user(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where u.id = auth.uid()
      and (
        u.role = 'ADMIN'
        or (
          u.role = 'ZDM'
          and exists (
            select 1 from employee_hierarchy eh
            where eh.ancestor_id = u.id
              and eh.descendant_id = target
              and eh.depth > 0
          )
        )
      )
  );
$$;

-- Seed zones (dummy data — replace via import)
insert into zones (id, code, name, collection_percent) values
  ('00000000-0000-0000-0000-000000000001', 'NORTH', 'North', 85),
  ('00000000-0000-0000-0000-000000000002', 'WEST', 'West', 88),
  ('00000000-0000-0000-0000-000000000003', 'SOUTH', 'South', 90),
  ('00000000-0000-0000-0000-000000000004', 'EAST', 'East', 86)
on conflict (code) do nothing;

comment on table employee_districts is 'M:N user to district assignments; blocks derived via districts→blocks join';
comment on view v_zdm_rollup_aop is 'Read-only aggregated zone AOP from all descendant team members';
