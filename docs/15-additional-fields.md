# 15. Recommended Additional Fields (Missing From Current Design)

Challenging the original brief to improve data quality, planning accuracy, reporting,
and scalability. Grouped by area; items marked (added) are already in this build.

## Identity & hierarchy
- `users.date_of_joining`, `users.tenure_months` - inform backfill/ramp assumptions.
- `users.is_active` (added) + `users.exit_date` - clean attrition handling.
- `territories.zone` (added) and a future `regions` level for >1 ZDM scale.
- Effective-dated hierarchy (`valid_from`/`valid_to`) for mid-year re-orgs.

## AOP master
- `fy` + `version` + `status` state machine (added) - re-planning and audit.
- `currency` and `fx_rate` - if multi-country later.
- `locked_by` / `locked_at` - explicit lock metadata beyond status.

## Revenue
- **Quarterly/monthly phasing** of the annual target (seasonality) - critical for
  realistic monthly reviews; recommend a `revenue_phasing` child table.
- `confidence_level` (commit/best-case/stretch) per target.
- `price_increase_assumption_pct` separating volume growth from price growth.

## Universe
- A real `school_master` (id, name, board, geo, enrollment) instead of only counts -
  unlocks school-level potential scoring and dedup of sampling across reps.
- `competitor_presence` and `current_share_of_wallet` per key account.
- `churn_risk_schools` count to justify the retention plan.

## Sampling & conversion
- `sampling_lead_time_days` and `sample_to_decision_window` - phasing realism.
- `cost_per_sample` (added) varies by product; recommend per-stream cost.
- Historical conversion baselines to validate planned conversion % (anti-sandbagging).

## Training
- `trainer_type` (in-house/partner) and `trainer_cost` split from material cost.
- `expected_participants_actual` vs planned for effectiveness tracking.

## Investment
- Map each cost line to a **GL/budget code** for finance reconciliation.
- `committed_vs_discretionary` flag per line for budget governance.
- Monthly phasing of spend (mirrors revenue phasing) for cash-flow planning.

## Hiring
- `replacement_for_user_id` (backfill linkage), `expected_join_date`,
  `ramp_months`, `cost_to_company` - tie hiring to revenue/cost impact precisely.
- `approval_status` separate from operational `status` (added single status; split later).

## Tracking & governance
- `actuals_tracking` granularity to **category** level (not just total) for category
  variance.
- `data_source` on actuals (ERP/manual) and `as_of_date` for reconciliation.
- Soft-delete (`deleted_at`) instead of hard deletes across tables.

## UX / adoption
- "Copy last year" and "apply % uplift" helpers to bootstrap a plan.
- Inline benchmark hints (zone median growth, peer AOV) next to inputs.
- Offline-first capture for low-connectivity field use (PWA + sync queue).

## Highest-impact recommendations
1. Add **revenue & investment phasing** (monthly) - without it, monthly reviews compare
   against a flat 1/12 and produce misleading variance.
2. Introduce a **school_master** - the single biggest unlock for accuracy, dedup,
   potential scoring, and AI later.
3. Capture **historical conversion/cost baselines** to make the "unrealistic target"
   validation quantitative rather than heuristic.
