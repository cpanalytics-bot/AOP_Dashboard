-- ===========================================================================
-- Seed data for the AOP Platform (FY26-27).
-- Run after 0001_schema.sql and 0002_rls.sql.
-- NOTE: passwords for demo auth users are 'Password123!' (change in prod).
-- This script inserts into auth.users so the public.users FK resolves.
-- ===========================================================================

-- ---- Territories ----------------------------------------------------------
insert into territories (id, code, name, district, state, zone, base_location) values
  ('11111111-0000-0000-0000-000000000001','DEL-N','Delhi North','North Delhi','Delhi','North','Delhi'),
  ('11111111-0000-0000-0000-000000000002','DEL-S','Delhi South','South Delhi','Delhi','North','Delhi'),
  ('11111111-0000-0000-0000-000000000003','NCR-GZB','Ghaziabad','Ghaziabad','Uttar Pradesh','North','Ghaziabad'),
  ('11111111-0000-0000-0000-000000000004','MUM-W','Mumbai West','Mumbai Suburban','Maharashtra','West','Mumbai'),
  ('11111111-0000-0000-0000-000000000005','PUN','Pune','Pune','Maharashtra','West','Pune'),
  ('11111111-0000-0000-0000-000000000006','BLR-E','Bengaluru East','Bengaluru Urban','Karnataka','South','Bengaluru');

-- ---- Auth users (demo) -----------------------------------------------------
-- Helper to insert a confirmed email/password auth user.
create or replace function seed_auth_user(p_id uuid, p_email text)
returns void language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values (p_id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          p_email, crypt('Password123!', gen_salt('bf')),
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}', '{}')
  on conflict (id) do nothing;
end $$;

select seed_auth_user('22222222-0000-0000-0000-000000000001','anita.rao@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000010','rohit.mehra@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000011','sneha.k@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000101','karan.singh@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000102','priya.nair@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000103','aman.gupta@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000104','meera.joshi@org.com');
select seed_auth_user('22222222-0000-0000-0000-000000000105','vivek.patil@org.com');

-- ---- Public users ----------------------------------------------------------
insert into users (id, employee_code, name, email, role, designation, base_location,
                   district_coverage, territory_id, reporting_manager_id, current_revenue, current_target) values
  ('22222222-0000-0000-0000-000000000001','ZDM001','Anita Rao','anita.rao@org.com','ZDM','Zonal Development Manager','Delhi','Delhi NCR + West','11111111-0000-0000-0000-000000000001',null,145000000,160000000),
  ('22222222-0000-0000-0000-000000000010','BDM010','Rohit Mehra','rohit.mehra@org.com','BDM','Business Development Manager','Delhi','Delhi NCR','11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001',62000000,70000000),
  ('22222222-0000-0000-0000-000000000011','BDM011','Sneha Kulkarni','sneha.k@org.com','BDM','Business Development Manager','Mumbai','Mumbai + Pune','11111111-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000001',58000000,65000000),
  ('22222222-0000-0000-0000-000000000101','BDA101','Karan Singh','karan.singh@org.com','BDA','Business Development Associate','Delhi','North Delhi','11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000010',22000000,25000000),
  ('22222222-0000-0000-0000-000000000102','BDA102','Priya Nair','priya.nair@org.com','BDA','Business Development Associate','Delhi','South Delhi','11111111-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000010',19500000,22000000),
  ('22222222-0000-0000-0000-000000000103','BDA103','Aman Gupta','aman.gupta@org.com','BDA','Business Development Associate','Ghaziabad','Ghaziabad','11111111-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000010',20500000,23000000),
  ('22222222-0000-0000-0000-000000000104','BDA104','Meera Joshi','meera.joshi@org.com','BDA','Business Development Associate','Mumbai','Mumbai West','11111111-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000011',28000000,30000000),
  ('22222222-0000-0000-0000-000000000105','BDA105','Vivek Patil','vivek.patil@org.com','BDA','Business Development Associate','Pune','Pune','11111111-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000011',24000000,27000000);

-- ---- Build employee_hierarchy closure (self + all ancestors) --------------
-- depth 0 = self; depth N = N levels up the reporting chain.
insert into employee_hierarchy (ancestor_id, descendant_id, depth)
with recursive chain as (
  select id as descendant_id, id as ancestor_id, 0 as depth from users
  union all
  select c.descendant_id, u.reporting_manager_id, c.depth + 1
  from chain c
  join users u on u.id = c.ancestor_id
  where u.reporting_manager_id is not null
)
select ancestor_id, descendant_id, depth from chain
on conflict do nothing;

-- ---- A sample submitted AOP for Meera Joshi (BDA104) ----------------------
insert into aop_master (id, user_id, fy, status, version, submitted_at)
values ('33333333-0000-0000-0000-000000000104','22222222-0000-0000-0000-000000000104','FY26-27','submitted',1, now());

insert into revenue_targets (aop_id, last_year_revenue, early_years_revenue_ly, math_science_revenue_ly,
  other_categories_revenue_ly, stem_revenue_ly, panel_revenue_ly, current_aov, current_revenue_per_school,
  total_revenue_target, early_years_target, math_science_target, other_categories_target, stem_target, panel_target,
  target_aov, target_revenue_per_school)
values ('33333333-0000-0000-0000-000000000104',28000000,5040000,8960000,4200000,5600000,4200000,145000,240000,
  34000000,6000000,12000000,5000000,7000000,4000000,165000,290000);

insert into universe_planning (aop_id, total_schools, active_schools, user_schools, non_user_schools,
  active_school_addition_plan, new_school_acquisition_plan, retention_plan)
values ('33333333-0000-0000-0000-000000000104',320,110,78,242,12,18,88);

insert into school_categories (aop_id, category, current_count, target_count, projected_revenue, projected_conversion) values
  ('33333333-0000-0000-0000-000000000104','Chain Schools',12,16,6000000,35),
  ('33333333-0000-0000-0000-000000000104','Premium Schools',18,22,6000000,35),
  ('33333333-0000-0000-0000-000000000104','Category A',30,34,8000000,35),
  ('33333333-0000-0000-0000-000000000104','Category B',28,32,8000000,35),
  ('33333333-0000-0000-0000-000000000104','Category C',22,26,6000000,35);

insert into distributor_planning (aop_id, existing_distributor, new_distributor_required, bulk_deal_opportunities, large_institutional_opportunities)
values ('33333333-0000-0000-0000-000000000104','Vidya Distributors Pvt Ltd', true, 4, 2);

insert into sampling_planning (aop_id, user_schools_sampling, non_user_schools_sampling, cost_per_sample, unique_sampling_factor)
values ('33333333-0000-0000-0000-000000000104',60,120,1200,0.7);

insert into conversion_planning (aop_id, user_school_conversion, non_user_school_conversion,
  sampling_to_revenue_estimate, sampling_to_orders_estimate, sampling_to_new_schools_estimate)
values ('33333333-0000-0000-0000-000000000104',45,18,9000000,140,22);

insert into training_planning (aop_id, user_school_trainings, teacher_workshops, cost_per_training, participants_per_training, expected_revenue_impact)
values ('33333333-0000-0000-0000-000000000104',40,25,8000,20,3000000);

insert into investment_planning (aop_id, sampling_cost, travel_cost, event_cost, promotional_cost, discount_cost)
values ('33333333-0000-0000-0000-000000000104',1200000,600000,400000,300000,500000);

insert into approval_workflow (aop_id, action, by_user_id, comment)
values ('33333333-0000-0000-0000-000000000104','submit','22222222-0000-0000-0000-000000000104','Submitted for BDM review.');

-- ---- A sample hiring request ----------------------------------------------
insert into hiring_requests (requested_by_user_id, for_territory_id, base_location, district, state,
  designation, number_of_positions, priority, reason, business_justification, expected_revenue_impact, hiring_timeline, status)
values ('22222222-0000-0000-0000-000000000010','11111111-0000-0000-0000-000000000003','Ghaziabad','Ghaziabad','Uttar Pradesh',
  'BDA',1,'High','Territory Split',
  'Ghaziabad universe has grown beyond a single BDA''s capacity; splitting to protect retention and accelerate new-school acquisition.',
  8000000,'2026-07','Requested');

-- ---- Sample monthly actuals (first quarter) -------------------------------
insert into actuals_tracking (user_id, fy, period_month, revenue_actual, schools_active, schools_new, samples_done, conversions, investment_spent) values
  ('22222222-0000-0000-0000-000000000104','FY26-27','2026-04-01',2400000,110,2,40,12,180000),
  ('22222222-0000-0000-0000-000000000104','FY26-27','2026-05-01',2700000,113,3,55,18,220000),
  ('22222222-0000-0000-0000-000000000104','FY26-27','2026-06-01',3100000,116,4,60,21,260000);
