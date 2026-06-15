# 12. Reporting Framework

## Reporting layers
1. **Operational (real-time):** dashboards reading `v_aop_kpis` + `actuals_tracking`.
2. **Periodic reviews:** `monthly_reviews`, `quarterly_reviews` (plan vs actual, variance,
   RAG).
3. **Analytical (warehouse):** denormalized fact/dim model for BI tools.

## Core report set
| Report | Grain | Source |
|--------|-------|--------|
| AOP vs Actual | user x month | actuals_tracking vs revenue_targets/monthly_reviews |
| Category performance | category x territory | school_categories + actuals |
| Universe penetration | territory | universe_planning (user/non-user, active) |
| Sampling efficiency | user | sampling + conversion (cost/conversion, rev/sample) |
| Investment & ROI | user/zone | investment_planning + actuals (spent vs planned) |
| Hiring pipeline | territory | hiring_requests by status |
| Zone ranking | zone | aggregated v_aop_kpis + actuals |
| Plan completion | hierarchy | aop_master.status counts |

## Variance model
```
variance_pct = (actual - plan) / plan * 100
RAG: Green >= -5%, Amber -5%..-15%, Red < -15%   (configurable thresholds)
```
Computed monthly into `monthly_reviews.variance_pct` and rolled to quarters.

## Roll-up architecture
Because every metric is keyed to a user in the hierarchy closure, roll-ups are
`SUM ... GROUP BY ancestor` joins:
```sql
select h.ancestor_id, sum(k.total_revenue_target)
from v_aop_kpis k
join employee_hierarchy h on h.descendant_id = k.user_id
where h.depth >= 0
group by h.ancestor_id;
```
This yields self+subtree totals for any manager at any level (BDM, ZDM, national).

## Suggested star schema (warehouse, future)
- `fact_actuals` (user_id, territory_id, date, category, revenue, samples, conversions, spend)
- `fact_plan` (user_id, territory_id, fy, category, target, planned_spend)
- Dims: `dim_user`, `dim_territory`, `dim_date`, `dim_category`.
This cleanly powers AOP-vs-Actual, category, penetration, and ROI cuts in any BI tool
(Metabase/Power BI/Looker) or Supabase's built-in SQL + charts.

## Export & distribution
- CSV/XLSX export per report (server action streaming from Postgres).
- Scheduled email/Slack digests for leadership (Edge Function + pg_cron).
