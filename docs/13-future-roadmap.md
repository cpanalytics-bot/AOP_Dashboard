# 13. Future Roadmap

The schema and engine are designed so these land as additive features, not rewrites.

## Phase 2 - Review cadence (Q1 FY26-27)
- Monthly target reviews UI on `monthly_reviews` (plan vs actual, variance, notes).
- Quarterly business reviews on `quarterly_reviews` with RAG and narrative.
- Real-time AOP-vs-Actual via Supabase Realtime on `actuals_tracking`.

## Phase 3 - Incentives
- `incentive_plans` (slabs, multipliers by role/category) + `incentive_payouts`
  (computed per period from actuals vs plan).
- Payout simulator so reps see "what-if" earnings against the AOP.

## Phase 4 - Forecasting
- Run-rate and seasonality-adjusted forecasts from `actuals_tracking` history.
- Confidence bands; auto-flag territories likely to miss AOP.

## Phase 5 - AI recommendations
- `school_master` + `school_potential_scores` (model output: propensity, expected value).
- Recommend sampling/training allocation that maximizes expected conversion within
  budget. Inputs already captured (universe, sampling, conversion, investment).

## Phase 6 - Territory & workforce optimization
- Territory optimization: rebalance schools/universe across BDAs using potential scores
  and travel cost; feeds `hiring_requests` (split/expansion reasons already modeled).
- Workforce planning: capacity model (schools-per-rep, calls/day) -> headcount plan.

## Phase 7 - Distributor effectiveness
- `distributors` master + `distributor_performance` (sell-through, fill rate, ROI).
- Link to `distributor_planning` to score existing vs needed distributors.

## Enablers carried in v1
- `aop_master.version` + status machine -> re-planning and mid-year revisions.
- Normalized `school_categories` -> add categories without schema change.
- `audit_logs` (jsonb diffs) -> compliance and change analytics.
- Hierarchy closure -> any-level rollup for new reports/dashboards.
