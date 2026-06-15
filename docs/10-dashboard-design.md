# 10. Dashboard Design

Implemented in [`src/app/dashboard/page.tsx`](../src/app/dashboard/page.tsx). Role
determines the default view; a `?user=` param drills into an individual.

## BDA dashboard (individual)
| Widget | Source | Purpose |
|--------|--------|---------|
| Target vs Actual (YTD) | actuals_tracking vs revenue_targets | progress to plan |
| KPI tiles | v_aop_kpis | revenue growth, school growth, investment %, ROI |
| Universe growth | universe_planning + school_categories | active/target/new/retention |
| Sampling performance | sampling + conversion planning | total samples, conversions, cost/conversion |
| Conversion performance | conversion_planning | user/non-user conversion % |

## BDM dashboard (team)
| Widget | Purpose |
|--------|---------|
| Summary tiles | team AOP target, plans submitted, approved, at-risk count |
| Team comparison table | per-BDA target, growth %, YTD %, status, open link |
| Territory comparison | aggregate by territory (extension of the same table) |
| Forecast achievement | YTD% vs plan, trend (from actuals) |

## ZDM dashboard (zone + leadership)
| Widget | Purpose |
|--------|---------|
| Zone summary tiles | zone target, plan completion, approved, revenue-at-risk |
| Zone team comparison | all BDMs + BDAs |
| Hiring status | open/approved/in-progress requests (from /hiring) |
| Revenue risk | reports below 75% YTD |
| Growth opportunity | highest school-growth / lowest penetration territories |
| Leadership rollup | target by BDM line with share-of-zone bars |

## Leadership dashboard (national)
Built by aggregating across zones (the ZDM rollup generalizes to multi-zone):
- National rollup (sum of zone targets vs actuals).
- Zone ranking (by achievement % and growth %).
- Revenue forecast (YTD run-rate projected to FY end).
- AOP variance (plan vs actual by zone/category).
- Budget utilization (investment spent vs planned).

## Visual language
- KPI tiles use tone (green/amber/red) by threshold (e.g. investment % > 25% = amber,
  YTD < 75% = red).
- Progress bars for achievement and share-of-target.
- Tables for comparison; bars for distribution; everything mobile-responsive.

## Data feeds
Plan side: `v_aop_kpis` + planning tables. Actual side: `actuals_tracking` (monthly) and
`monthly_reviews`/`quarterly_reviews`. The prototype uses deterministic demo actuals;
production swaps in `actuals_tracking` joins.
