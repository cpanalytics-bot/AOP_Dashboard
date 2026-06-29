-- Admin "Project Health" table needs two more columns:
--   * total_schools       -> shown as "LY Target School" (Universe total schools)
--   * reimbursement_budget -> the member's planned Reimbursement cost
-- Extend aop_admin_overview to return both. Non-destructive CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.aop_admin_overview()
 RETURNS TABLE(zm_email text, zm_name text, member_email text, member_name text, member_role text, city_district text, member_status text, is_filled boolean, revenue_target numeric, target_aov numeric, target_schools numeric, last_year_revenue numeric, active_schools numeric, total_schools numeric, reimbursement_budget numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH zms AS (
    SELECT e.email AS zm_email, e.name AS zm_name
    FROM public.emp_record e
    WHERE e.role='ZM' AND e.team='Sales' AND e.line_of_business ILIKE '%K8%' AND e.status='Active'
  ),
  members AS (
    SELECT e.zonal_manager_email AS zm_email, e.email AS member_email, e.name AS member_name,
           e.role AS member_role, e.city_district
    FROM public.emp_record e
    WHERE e.team='Sales' AND e.line_of_business ILIKE '%K8%' AND e.status='Active'
      AND lower(e.email) <> lower(e.zonal_manager_email)
      AND lower(e.zonal_manager_email) IN (SELECT lower(zm_email) FROM zms)
  ),
  master AS ( SELECT zm_email, id AS aop_id FROM public.aop_master WHERE fy='FY26-27' )
  SELECT z.zm_email, z.zm_name, m.member_email, m.member_name,
         CASE WHEN m.member_role='ZM' THEN 'ZDM' ELSE m.member_role END,
         m.city_district,
         COALESCE(am.status, 'not_started'), COALESCE(am.is_filled, false),
         r.total_revenue_target, r.target_aov,
         (SELECT COALESCE(SUM(uc.target_count),0) FROM public.aop_universe_category uc
            WHERE lower(uc.employee_email)=lower(m.member_email) AND lower(uc.zm_email)=lower(z.zm_email)),
         (sc.snapshot->'revenue'->>'last_year_revenue')::numeric,
         (sc.snapshot->'universe'->>'active_schools')::numeric,
         (sc.snapshot->'universe'->>'total_schools')::numeric,
         cost.reimbursement_cost
  FROM zms z
  JOIN members m ON lower(m.zm_email) = lower(z.zm_email)
  LEFT JOIN master ms ON lower(ms.zm_email) = lower(z.zm_email)
  LEFT JOIN public.aop_member am ON am.aop_id = ms.aop_id AND lower(am.employee_email)=lower(m.member_email)
  LEFT JOIN public.aop_revenue r ON r.aop_id = ms.aop_id AND lower(r.employee_email)=lower(m.member_email)
  LEFT JOIN public.aop_cost cost ON cost.aop_id = ms.aop_id AND lower(cost.employee_email)=lower(m.member_email)
  LEFT JOIN public.aop_snapshot_cache sc ON lower(sc.employee_email)=lower(m.member_email)
  ORDER BY z.zm_name, m.member_role, m.member_name;
$function$;
