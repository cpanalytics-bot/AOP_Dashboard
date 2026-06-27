-- Last Year Actuals revenue: switch from NET SKU revenue to GROSS booked revenue.
--
-- Before: last_year_revenue = Σ sku_amount from processed_k8_orders_sku (net of
-- series discounts, invoiced/delivered SKUs only) -> brijmohan ₹43,51,653.
-- The K8 dashboard's "Revenue" is the GROSS booked order value = Σ order_amount
-- EXCLUDING Cancelled (Out of Stock kept). Align the AOP "Last Year Actuals ·
-- Revenue" to that basis so the two match -> brijmohan ₹50,53,179.
--
-- Category splits (Early Years / Math & Science / Other Books) only exist at the
-- SKU level, so we keep the SKU category MIX and pro-rate it up to the gross total;
-- the three splits therefore always sum back exactly to last_year_revenue.
--
-- current_aov is preserved here (sku_amount ÷ orders) but is overridden downstream
-- in aop_snapshot_cache by the orders_agg AOV, so the displayed AOV is unchanged.
--
-- Non-destructive (CREATE OR REPLACE VIEW). aop_snapshot_cache is the only
-- dependent and must be refreshed after replacing the view (done at the end).

create or replace view public.aop_src_revenue_ly as
with sku as (
  -- net SKU revenue + category mix (from processed/invoiced/delivered orders)
  select
    employee_email,
    sum(sku_amount) as net_total,
    sum(sku_amount) filter (
      where grade = any (array['Pre Nursery','Nursery','LKG','UKG'])
    ) as early_years_net,
    sum(sku_amount) filter (
      where grade = any (array['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8'])
        and subject = any (array['Maths','Maths - Maths Master','Science','Science - Science Era'])
    ) as math_science_net,
    count(distinct regexp_replace(order_id, '_[0-9].*$', '')) as orders
  from processed_k8_orders_sku
  where employee_email is not null and employee_email <> ''
  group by employee_email
),
gross as (
  -- gross booked revenue = Σ order_amount excluding Cancelled, employee-scoped
  select
    lower(btrim(employee_email_id)) as employee_email,
    sum(order_amount)::numeric as gross_total
  from order_form_k8_25_26
  where status is distinct from 'Cancelled'
    and employee_email_id is not null and btrim(employee_email_id) <> ''
  group by lower(btrim(employee_email_id))
)
select
  coalesce(g.employee_email, s.employee_email) as employee_email,
  coalesce(g.gross_total, 0) as last_year_revenue,
  case when coalesce(s.net_total,0) > 0
       then round(coalesce(s.early_years_net,0) / s.net_total * coalesce(g.gross_total,0), 2)
       else 0 end as early_years_ly,
  case when coalesce(s.net_total,0) > 0
       then round(coalesce(s.math_science_net,0) / s.net_total * coalesce(g.gross_total,0), 2)
       else 0 end as math_science_ly,
  coalesce(g.gross_total,0)
    - (case when coalesce(s.net_total,0) > 0 then round(coalesce(s.early_years_net,0)/s.net_total*coalesce(g.gross_total,0),2) else 0 end)
    - (case when coalesce(s.net_total,0) > 0 then round(coalesce(s.math_science_net,0)/s.net_total*coalesce(g.gross_total,0),2) else 0 end)
    as other_categories_ly,
  round(s.net_total / nullif(s.orders,0)::numeric, 2) as current_aov
from gross g
full outer join sku s on s.employee_email = g.employee_email;

refresh materialized view public.aop_snapshot_cache;
