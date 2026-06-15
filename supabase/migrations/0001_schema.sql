-- ===========================================================================
-- AOP Platform FY26-27 - Core schema
-- 18 tables. PostgreSQL / Supabase.
-- Conventions:
--   * uuid primary keys (gen_random_uuid())
--   * created_at / updated_at timestamptz on mutable tables
--   * updated_by references users(id) for audit
--   * money stored as numeric(14,2) (INR), percentages as numeric(5,2)
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------
create type role_t            as enum ('ZDM', 'BDM', 'BDA');
create type aop_status_t       as enum ('not_started','draft','submitted','in_review','changes_requested','approved','rejected');
create type hiring_status_t    as enum ('Requested','Approved','In Progress','Closed');
create type hiring_priority_t  as enum ('Critical','High','Medium','Low');
create type hiring_reason_t    as enum (
  'New Territory Expansion','Territory Split','High Potential Market',
  'Backfill','Attrition Replacement','Business Growth','Strategic Account Requirement');
create type approval_action_t  as enum ('submit','approve','reject','request_changes');
create type school_category_t  as enum ('Chain Schools','Premium Schools','Category A','Category B','Category C');

-- ---------------------------------------------------------------------------
-- 1. territories
-- ---------------------------------------------------------------------------
create table territories (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  district      text not null,
  state         text not null,
  zone          text not null,
  base_location text not null,
  created_at    timestamptz not null default now()
);
create index idx_territories_zone  on territories(zone);
create index idx_territories_state on territories(state);

-- ---------------------------------------------------------------------------
-- 2. users  (1:1 with auth.users via id)
-- ---------------------------------------------------------------------------
create table users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  employee_code       text not null unique,
  name                text not null,
  email               text not null unique,
  role                role_t not null,
  designation         text not null,
  base_location       text not null,
  district_coverage   text not null,
  territory_id        uuid references territories(id),
  reporting_manager_id uuid references users(id),
  current_revenue     numeric(14,2) not null default 0,
  current_target      numeric(14,2) not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_users_role     on users(role);
create index idx_users_manager  on users(reporting_manager_id);
create index idx_users_territory on users(territory_id);

-- ---------------------------------------------------------------------------
-- 3. employee_hierarchy (materialized closure table for fast subtree queries)
--    ancestor_id manages descendant_id at `depth` levels down (depth 0 = self).
-- ---------------------------------------------------------------------------
create table employee_hierarchy (
  ancestor_id   uuid not null references users(id) on delete cascade,
  descendant_id uuid not null references users(id) on delete cascade,
  depth         int  not null,
  primary key (ancestor_id, descendant_id)
);
create index idx_hierarchy_descendant on employee_hierarchy(descendant_id);

-- ---------------------------------------------------------------------------
-- 4. aop_master (one row per user per fiscal year; the AOP root)
-- ---------------------------------------------------------------------------
create table aop_master (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id),
  fy            text not null,
  status        aop_status_t not null default 'not_started',
  version       int not null default 1,
  submitted_at  timestamptz,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id),
  unique (user_id, fy)            -- duplicate prevention
);
create index idx_aop_user   on aop_master(user_id);
create index idx_aop_status on aop_master(status);
create index idx_aop_fy      on aop_master(fy);

-- ---------------------------------------------------------------------------
-- 5. revenue_targets (Stage 2)
-- ---------------------------------------------------------------------------
create table revenue_targets (
  id                          uuid primary key default gen_random_uuid(),
  aop_id                      uuid not null unique references aop_master(id) on delete cascade,
  last_year_revenue           numeric(14,2) not null default 0,
  early_years_revenue_ly      numeric(14,2) not null default 0,
  math_science_revenue_ly     numeric(14,2) not null default 0,
  other_categories_revenue_ly numeric(14,2) not null default 0,
  stem_revenue_ly             numeric(14,2) not null default 0,
  panel_revenue_ly            numeric(14,2) not null default 0,
  current_aov                 numeric(14,2) not null default 0,
  current_revenue_per_school  numeric(14,2) not null default 0,
  total_revenue_target        numeric(14,2) not null default 0,
  early_years_target          numeric(14,2) not null default 0,
  math_science_target         numeric(14,2) not null default 0,
  other_categories_target     numeric(14,2) not null default 0,
  stem_target                 numeric(14,2) not null default 0,
  panel_target                numeric(14,2) not null default 0,
  target_aov                  numeric(14,2) not null default 0,
  target_revenue_per_school   numeric(14,2) not null default 0,
  -- generated: growth %
  revenue_growth_pct numeric(7,2)
    generated always as (
      case when last_year_revenue > 0
        then round((total_revenue_target - last_year_revenue) / last_year_revenue * 100, 2)
        else 0 end) stored,
  category_sum_target numeric(14,2)
    generated always as (
      early_years_target + math_science_target + other_categories_target + stem_target + panel_target) stored,
  updated_at timestamptz not null default now()
);
create index idx_revenue_aop on revenue_targets(aop_id);

-- ---------------------------------------------------------------------------
-- 6. universe_planning (Stage 3 - header)
-- ---------------------------------------------------------------------------
create table universe_planning (
  id                            uuid primary key default gen_random_uuid(),
  aop_id                        uuid not null unique references aop_master(id) on delete cascade,
  total_schools                 int not null default 0,
  active_schools                int not null default 0,
  user_schools                  int not null default 0,
  non_user_schools              int not null default 0,
  active_school_addition_plan   int not null default 0,
  new_school_acquisition_plan   int not null default 0,
  retention_plan                numeric(5,2) not null default 0,
  key_account_plan              text default '',
  chain_school_expansion_plan   text default '',
  premium_school_strategy       text default '',
  updated_at timestamptz not null default now()
);
create index idx_universe_aop on universe_planning(aop_id);

-- ---------------------------------------------------------------------------
-- 7. school_categories (Stage 3 - per category rows; normalized)
-- ---------------------------------------------------------------------------
create table school_categories (
  id                   uuid primary key default gen_random_uuid(),
  aop_id               uuid not null references aop_master(id) on delete cascade,
  category             school_category_t not null,
  current_count        int not null default 0,
  target_count         int not null default 0,
  projected_revenue    numeric(14,2) not null default 0,
  projected_conversion numeric(5,2) not null default 0,
  unique (aop_id, category)
);
create index idx_school_cat_aop on school_categories(aop_id);

-- ---------------------------------------------------------------------------
-- 8. distributor_planning (Stage 3 - distributor mapping)
-- ---------------------------------------------------------------------------
create table distributor_planning (
  id                                 uuid primary key default gen_random_uuid(),
  aop_id                             uuid not null unique references aop_master(id) on delete cascade,
  existing_distributor               text default '',
  new_distributor_required           boolean not null default false,
  strategic_distributor_opportunity  text default '',
  bulk_deal_opportunities            int not null default 0,
  large_institutional_opportunities  int not null default 0,
  updated_at timestamptz not null default now()
);
create index idx_distributor_aop on distributor_planning(aop_id);

-- ---------------------------------------------------------------------------
-- 9. sampling_planning (Stage 4)
-- ---------------------------------------------------------------------------
create table sampling_planning (
  id                       uuid primary key default gen_random_uuid(),
  aop_id                   uuid not null unique references aop_master(id) on delete cascade,
  user_schools_sampling    int not null default 0,
  non_user_schools_sampling int not null default 0,
  test_prep_sampling       int not null default 0,
  early_years_sampling     int not null default 0,
  ms_sampling              int not null default 0,
  stem_sampling            int not null default 0,
  panel_sampling           int not null default 0,
  cost_per_sample          numeric(12,2) not null default 0,
  unique_sampling_factor   numeric(4,3) not null default 1,
  total_sampling_schools int
    generated always as (
      user_schools_sampling + non_user_schools_sampling + test_prep_sampling +
      early_years_sampling + ms_sampling + stem_sampling + panel_sampling) stored,
  updated_at timestamptz not null default now()
);
create index idx_sampling_aop on sampling_planning(aop_id);

-- ---------------------------------------------------------------------------
-- 10. conversion_planning (Stage 4)
-- ---------------------------------------------------------------------------
create table conversion_planning (
  id                              uuid primary key default gen_random_uuid(),
  aop_id                          uuid not null unique references aop_master(id) on delete cascade,
  user_school_conversion          numeric(5,2) not null default 0,
  non_user_school_conversion      numeric(5,2) not null default 0,
  sampling_to_revenue_estimate    numeric(14,2) not null default 0,
  sampling_to_orders_estimate     int not null default 0,
  sampling_to_new_schools_estimate int not null default 0,
  updated_at timestamptz not null default now()
);
create index idx_conversion_aop on conversion_planning(aop_id);

-- ---------------------------------------------------------------------------
-- 11. training_planning (Stage 5)
-- ---------------------------------------------------------------------------
create table training_planning (
  id                        uuid primary key default gen_random_uuid(),
  aop_id                    uuid not null unique references aop_master(id) on delete cascade,
  user_school_trainings     int not null default 0,
  non_user_school_trainings int not null default 0,
  digital_trainings         int not null default 0,
  physical_trainings        int not null default 0,
  teacher_workshops         int not null default 0,
  principal_workshops       int not null default 0,
  stem_workshops            int not null default 0,
  product_demonstrations    int not null default 0,
  cost_per_training         numeric(12,2) not null default 0,
  participants_per_training  int not null default 0,
  expected_revenue_impact   numeric(14,2) not null default 0,
  total_trainings int
    generated always as (
      user_school_trainings + non_user_school_trainings + digital_trainings +
      physical_trainings + teacher_workshops + principal_workshops +
      stem_workshops + product_demonstrations) stored,
  updated_at timestamptz not null default now()
);
create index idx_training_aop on training_planning(aop_id);

-- ---------------------------------------------------------------------------
-- 12. investment_planning (Stage 6)
-- ---------------------------------------------------------------------------
create table investment_planning (
  id                          uuid primary key default gen_random_uuid(),
  aop_id                      uuid not null unique references aop_master(id) on delete cascade,
  sampling_cost               numeric(14,2) not null default 0,
  reimbursement_cost          numeric(14,2) not null default 0,
  travel_cost                 numeric(14,2) not null default 0,
  distributor_support_cost    numeric(14,2) not null default 0,
  event_cost                  numeric(14,2) not null default 0,
  gift_cost                   numeric(14,2) not null default 0,
  tod_cost                    numeric(14,2) not null default 0,
  promotional_cost            numeric(14,2) not null default 0,
  scheme_cost                 numeric(14,2) not null default 0,
  discount_cost               numeric(14,2) not null default 0,
  strategic_account_investment numeric(14,2) not null default 0,
  other_cost                  numeric(14,2) not null default 0,
  total_investment numeric(14,2)
    generated always as (
      sampling_cost + reimbursement_cost + travel_cost + distributor_support_cost +
      event_cost + gift_cost + tod_cost + promotional_cost + scheme_cost +
      discount_cost + strategic_account_investment + other_cost) stored,
  updated_at timestamptz not null default now()
);
create index idx_investment_aop on investment_planning(aop_id);

-- ---------------------------------------------------------------------------
-- 13. hiring_requests (Stage 1)
-- ---------------------------------------------------------------------------
create table hiring_requests (
  id                      uuid primary key default gen_random_uuid(),
  requested_by_user_id    uuid not null references users(id),
  for_territory_id        uuid references territories(id),
  base_location           text not null,
  district                text not null,
  state                   text not null,
  designation             text not null,
  number_of_positions     int not null check (number_of_positions >= 1),
  priority                hiring_priority_t not null,
  reason                  hiring_reason_t not null,
  business_justification  text not null,
  expected_revenue_impact numeric(14,2) not null default 0,
  hiring_timeline         text not null,
  status                  hiring_status_t not null default 'Requested',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_hiring_requester on hiring_requests(requested_by_user_id);
create index idx_hiring_status    on hiring_requests(status);

-- ---------------------------------------------------------------------------
-- 14. approval_workflow (per AOP event log)
-- ---------------------------------------------------------------------------
create table approval_workflow (
  id          uuid primary key default gen_random_uuid(),
  aop_id      uuid not null references aop_master(id) on delete cascade,
  action      approval_action_t not null,
  by_user_id  uuid not null references users(id),
  comment     text default '',
  created_at  timestamptz not null default now()
);
create index idx_approval_aop on approval_workflow(aop_id);

-- ---------------------------------------------------------------------------
-- 15. audit_logs (generic change log)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid,
  action      text not null,            -- insert / update / delete
  changed_by  uuid references users(id),
  diff        jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_table on audit_logs(table_name, record_id);
create index idx_audit_actor on audit_logs(changed_by);

-- ---------------------------------------------------------------------------
-- 16. actuals_tracking (monthly actuals for AOP-vs-Actual)
-- ---------------------------------------------------------------------------
create table actuals_tracking (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id),
  fy                text not null,
  period_month      date not null,           -- first day of month
  revenue_actual    numeric(14,2) not null default 0,
  schools_active    int not null default 0,
  schools_new       int not null default 0,
  samples_done      int not null default 0,
  conversions       int not null default 0,
  investment_spent  numeric(14,2) not null default 0,
  created_at        timestamptz not null default now(),
  unique (user_id, fy, period_month)
);
create index idx_actuals_user on actuals_tracking(user_id, fy);

-- ---------------------------------------------------------------------------
-- 17. monthly_reviews
-- ---------------------------------------------------------------------------
create table monthly_reviews (
  id            uuid primary key default gen_random_uuid(),
  aop_id        uuid not null references aop_master(id) on delete cascade,
  period_month  date not null,
  revenue_plan  numeric(14,2) not null default 0,
  revenue_actual numeric(14,2) not null default 0,
  variance_pct  numeric(7,2),
  notes         text default '',
  reviewed_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (aop_id, period_month)
);
create index idx_monthly_aop on monthly_reviews(aop_id);

-- ---------------------------------------------------------------------------
-- 18. quarterly_reviews
-- ---------------------------------------------------------------------------
create table quarterly_reviews (
  id            uuid primary key default gen_random_uuid(),
  aop_id        uuid not null references aop_master(id) on delete cascade,
  quarter       text not null,             -- e.g. 'Q1 FY26-27'
  revenue_plan  numeric(14,2) not null default 0,
  revenue_actual numeric(14,2) not null default 0,
  variance_pct  numeric(7,2),
  rag_status    text,                       -- Red / Amber / Green
  notes         text default '',
  reviewed_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (aop_id, quarter)
);
create index idx_quarterly_aop on quarterly_reviews(aop_id);

-- ===========================================================================
-- KPI VIEW - mirrors lib/calc.ts so dashboards can read consolidated KPIs.
-- ===========================================================================
create or replace view v_aop_kpis as
select
  m.id                              as aop_id,
  m.user_id,
  m.fy,
  m.status,
  r.total_revenue_target,
  r.revenue_growth_pct,
  case when r.current_aov > 0
    then round((r.target_aov - r.current_aov) / r.current_aov * 100, 2) else 0 end as aov_growth_pct,
  u.retention_plan                  as retention_pct,
  inv.total_investment,
  case when r.total_revenue_target > 0
    then round(inv.total_investment / r.total_revenue_target * 100, 2) else 0 end as investment_pct,
  case when inv.total_investment > 0
    then round(r.total_revenue_target / inv.total_investment * 100, 2) else 0 end as roi_pct,
  s.total_sampling_schools,
  t.total_trainings
from aop_master m
left join revenue_targets    r   on r.aop_id = m.id
left join universe_planning  u   on u.aop_id = m.id
left join investment_planning inv on inv.aop_id = m.id
left join sampling_planning  s   on s.aop_id = m.id
left join training_planning  t   on t.aop_id = m.id;
