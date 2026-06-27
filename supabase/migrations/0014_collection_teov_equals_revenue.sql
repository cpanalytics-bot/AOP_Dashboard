-- Last Year Collection Reference: make "Total Order Value" equal the member's
-- Last Year Actuals revenue.
--
-- Before: employee_order_value (teov) = Σ order value of the member's ENABLED
-- DISTRIBUTOR customers (customer-scoped order book) -> brijmohan ₹58,67,991.
-- That is a different scope (and includes orders other employees booked for the
-- same distributors), so it never matched the revenue card.
--
-- After: teov = the member's OWN Σ order_amount EXCLUDING Cancelled from
-- order_form_k8_25_26 -- the exact same computation as aop_src_revenue_ly
-- (the Last Year Actuals revenue) -> brijmohan ₹50,53,179, so the two now agree.
-- For the ZM rollup branch (v_is_zm) the base is the whole zone (zm_email_id).
--
-- Only the teov CTE changes in BOTH branches; the commitment schedule (sched/
-- commit_m) and validated payments (pay_m) are untouched. Commitment % and
-- Collection % are simply re-divided by the new base (brijmohan collection %:
-- 21.85% -> 25.37%). Non-destructive (CREATE OR REPLACE FUNCTION), reversible.
--
-- NOTE (pre-existing, not changed here): the onboarding commitment percentages
-- sum to well over 100% of order value, so the per-month Commitment % column is
-- inflated regardless of the base. Worth a separate data-quality pass.

CREATE OR REPLACE FUNCTION public.aop_last_year_collection(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  v_is_zm boolean := (lower(p_email) = lower('donbosco.joseph@pw.live'));
  v_in_zone boolean;
begin
  select exists(
    select 1 from emp_record e
    where lower(e.email) = lower(p_email)
      and lower(e.zonal_manager_email) = lower('donbosco.joseph@pw.live')
  ) into v_in_zone;

  if v_is_zm or v_in_zone then
    with cur as (select date_trunc('month', current_date)::date as cm),
    ob as (
      select distinct on (customer_code)
             customer_code, company_trade_name as trade_name,
             periodic_payment_commitment_1, periodic_payment_commitment_1_pct,
             periodic_payment_commitment_2, periodic_payment_commitment_2_pct,
             periodic_payment_commitment_3, periodic_payment_commitment_3_pct
      from onboarding_backend
      where ((v_is_zm and zm_email = p_email) or (not v_is_zm and employee_email = p_email))
        and "Select Customer Type" = 'Distributor'
        and "Onboarding Status" = 'Onboarded'
        and "Customer Status" = 'Enabled'
        and customer_code is not null
      order by customer_code, company_trade_name
    ),
    ordv as (
      select customer_code, sum(order_amount::numeric) as order_amount
      from order_form_k8_history_25_26
      where ops_status = 'Approved' and status = 'Delivered'
        and customer_code is not null
        and order_amount ~ '^-?\d+(\.\d+)?$'
      group by customer_code
    ),
    cust as (
      select o.customer_code, o.trade_name, coalesce(v.order_amount, 0) as order_amount
      from ob o left join ordv v on v.customer_code = o.customer_code
    ),
    teov as (
      select coalesce(sum(order_amount), 0)::numeric as total_order_value
      from order_form_k8_25_26
      where status is distinct from 'Cancelled'
        and case when v_is_zm then lower(btrim(zm_email_id)) = lower(p_email)
                 else lower(btrim(employee_email_id)) = lower(p_email) end
    ),
    sched as (
      select co.customer_code, date_trunc('month', c.cdate)::date as mkey, c.cpct, co.order_amount
      from ob o
      join cust co on co.customer_code = o.customer_code
      cross join lateral (values
         (o.periodic_payment_commitment_1, o.periodic_payment_commitment_1_pct),
         (o.periodic_payment_commitment_2, o.periodic_payment_commitment_2_pct),
         (o.periodic_payment_commitment_3, o.periodic_payment_commitment_3_pct)
      ) as c(cdate, cpct)
      where c.cdate is not null and c.cpct is not null
    ),
    commit_m as (select mkey, sum(order_amount * cpct) as commit_amt from sched group by mkey),
    pay_m as (
      select date_trunc('month', to_date(p.date_of_payment, 'DD-MM-YYYY'))::date as mkey,
             sum(p.payment_amount::numeric) as paid
      from payment_collection_25_26 p
      where ((v_is_zm and p.zm_email_id = p_email) or (not v_is_zm and p.employee_email_id = p_email))
        and upper(coalesce(p.finance_validation, '')) = 'YES'
        and p.date_of_payment ~ '^\d{1,2}-\d{1,2}-\d{4}$'
        and p.payment_amount ~ '^-?\d+(\.\d+)?$'
      group by date_trunc('month', to_date(p.date_of_payment, 'DD-MM-YYYY'))::date
    ),
    months as (
      select cm.mkey, to_char(cm.mkey, 'Mon YYYY') as month_label, cm.commit_amt,
             (select total_order_value from teov) as teov,
             case when cm.mkey > (select cm from cur) then null else coalesce(pm.paid, 0) end as actual
      from commit_m cm left join pay_m pm on pm.mkey = cm.mkey
    ),
    agg as (select coalesce(sum(actual), 0) as actual_total from months)
    select jsonb_build_object(
      'totals', jsonb_build_object(
         'employee_order_value', (select total_order_value from teov),
         'actual_total', (select actual_total from agg),
         'collection_pct', case when (select total_order_value from teov) > 0
                then round(((select actual_total from agg) / (select total_order_value from teov)) * 100, 2) else 0 end),
      'months', coalesce((select jsonb_agg(jsonb_build_object(
           'month', month_label, 'mkey', mkey,
           'commitment_pct', case when teov > 0 then round((commit_amt / teov) * 100, 2) else 0 end,
           'collection_pct', case when actual is null then null when teov > 0 then round((actual / teov) * 100, 2) else 0 end,
           'actual', actual) order by mkey) from months), '[]'::jsonb)
    ) into result;
    return result;
  end if;

  with cur as (select date_trunc('month', current_date)::date as cm),
  ob as (
    select distinct on (customer_code)
           customer_code, trade_name,
           commitment_date_1, commitment_percentage_1,
           commitment_date_2, commitment_percentage_2,
           commitment_date_3, commitment_percentage_3,
           commitment_date_4, commitment_percentage_4,
           commitment_date_5, commitment_percentage_5,
           commitment_date_6, commitment_percentage_6
    from onboarding_form
    where employee_email_id = p_email
      and customer_code is not null
      and upper(coalesce(customer_status, '')) = 'ENABLED'
    order by customer_code, id desc
  ),
  cust as (
    select o.customer_code, o.trade_name, coalesce(m.total_order_amount, 0) as order_amount
    from ob o left join mv_customer_finance_summary m on m.customer_code = o.customer_code
  ),
  teov as (
    select coalesce(sum(order_amount), 0)::numeric as total_order_value
    from order_form_k8_25_26
    where status is distinct from 'Cancelled'
      and lower(btrim(employee_email_id)) = lower(p_email)
  ),
  sched as (
    select co.customer_code, date_trunc('month', c.cdate)::date as mkey, c.cpct, co.order_amount
    from ob o
    join cust co on co.customer_code = o.customer_code
    cross join lateral (values
       (o.commitment_date_1, o.commitment_percentage_1),
       (o.commitment_date_2, o.commitment_percentage_2),
       (o.commitment_date_3, o.commitment_percentage_3),
       (o.commitment_date_4, o.commitment_percentage_4),
       (o.commitment_date_5, o.commitment_percentage_5),
       (o.commitment_date_6, o.commitment_percentage_6)
    ) as c(cdate, cpct)
    where c.cdate is not null and c.cpct is not null
  ),
  commit_m as (select mkey, sum(order_amount * cpct) as commit_amt from sched group by mkey),
  pay_m as (
    select date_trunc('month', left(p.date_of_payment, 10)::date)::date as mkey,
           sum(p.amount) as paid
    from payment_submissions p
    where p.employee_email = p_email
      and upper(coalesce(p.finance_validation, '')) = 'YES'
      and p.date_of_payment ~ '^\d{4}-\d{2}-\d{2}'
    group by date_trunc('month', left(p.date_of_payment, 10)::date)::date
  ),
  months as (
    select cm.mkey, to_char(cm.mkey, 'Mon YYYY') as month_label, cm.commit_amt,
           (select total_order_value from teov) as teov,
           case when cm.mkey > (select cm from cur) then null else coalesce(pm.paid, 0) end as actual
    from commit_m cm left join pay_m pm on pm.mkey = cm.mkey
  ),
  agg as (select coalesce(sum(actual), 0) as actual_total from months)
  select jsonb_build_object(
    'totals', jsonb_build_object(
       'employee_order_value', (select total_order_value from teov),
       'actual_total', (select actual_total from agg),
       'collection_pct', case when (select total_order_value from teov) > 0
              then round(((select actual_total from agg) / (select total_order_value from teov)) * 100, 2) else 0 end),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
         'month', month_label, 'mkey', mkey,
         'commitment_pct', case when teov > 0 then round((commit_amt / teov) * 100, 2) else 0 end,
         'collection_pct', case when actual is null then null when teov > 0 then round((actual / teov) * 100, 2) else 0 end,
         'actual', actual) order by mkey) from months), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;
