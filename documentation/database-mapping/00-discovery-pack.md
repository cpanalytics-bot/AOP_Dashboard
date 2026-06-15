# AOP Platform — Database Architecture Discovery Pack

> Reverse-engineered from the running application (Next.js prototype + designed Supabase
> schema). This pack maps **every value visible in the UI** to a source, exposes every
> calculation and dependency, and lists every unknown as `NEEDS_MAPPING` for business
> sign-off **before** Supabase implementation is finalised.

## How to read this pack
- **Source of truth for the audit:** the application code in `src/` and the designed SQL
  in `supabase/migrations/`. The prototype currently runs in **demo mode** (in-memory
  store + `localStorage`, seeded by `src/lib/mock-data.ts`). The 18-table Supabase schema
  is **designed but not the live runtime source** in demo mode.
- **Status legend (used everywhere):**
  - `CONFIRMED` — value is captured/persisted by a clearly defined field in this codebase and maps to a designed table.
  - `DERIVED` — value is calculated at runtime from other fields; not stored (or stored as a generated column). Formula is known.
  - `LOOKUP` — value is resolved by joining to a master table (territories / users).
  - `NEEDS_MAPPING` — value is currently produced from a **synthetic constant or demo placeholder**; the real source system is **not confirmed**. Must be mapped by a business owner.
  - `NEEDS_INPUT` — design exists but a business rule/threshold/owner is unconfirmed.
- **CSV companions** (exhaustive, machine-readable) live beside this file in
  `/documentation/database-mapping/`:
  `field_inventory.csv`, `source_mapping.csv`, `kpi_inventory.csv`,
  `calculation_inventory.csv`, `historical_data_requirements.csv`,
  `prefill_logic_inventory.csv`, `existing_tables.csv`, `proposed_tables.csv`,
  `relationship_mapping.csv`.

### CRITICAL HONESTY NOTE (challenge of assumptions)
The prototype **fabricates** several "current/historical/actual" values that a production
system must source from real systems. These are the highest-risk items and are all flagged
`NEEDS_MAPPING`:
1. `users.current_revenue` / `users.current_target` — seeded constants in `mock-data.ts`.
2. `revenue_targets.last_year_revenue` and the 5 LY category splits — derived from
   `current_revenue × hard-coded ratios` (0.18 / 0.32 / 0.15 / 0.20 / 0.15).
3. `revenue_targets.current_aov` (₹145,000) and `current_revenue_per_school` (₹240,000) —
   **hard-coded constants**, identical for every employee.
4. Universe counts (`total_schools` 320, `active_schools` 110, `user_schools` 78,
   `non_user_schools` 242, per-category current counts) — seeded constants, no school master.
5. Dashboard **Target-vs-Actual YTD** and **achievement %** — computed by a demo function
   `55 + (employeeCode.charCodeAt % 40)`; **not a real actual**.
6. `collection_percent` per region — a hard-coded map (North 85 / West 88 / South 90 /
   East 86); needs a confirmed region-policy source.

---

# PHASE 1 — Screen Discovery

| Screen | Purpose | User Role | Inputs | Outputs |
|--------|---------|-----------|--------|---------|
| Login (`/login`) | Authenticate / pick persona | All | Persona selection (demo) / email+password (live) | Session, redirect |
| Employee Card List (`/`) | Pick whom to plan/review; see status | All (scope by role) | Search, role filter | Employee cards, achievement %, AOP status, actions |
| AOP Wizard (`/aop/[id]`) | Build/edit/review an AOP across 8 steps | Owner (self) / Manager (subtree) | All stage inputs | Draft, KPIs, submission, approval events |
| — Stage 1 Hiring | Manpower gaps before planning | BDM/ZDM create; BDA read | Hiring request fields | Hiring request rows |
| — Stage 2 Revenue | Set FY targets by category + AOV | Editor | 8 target inputs + auto-split | Revenue KPIs |
| — Stage 3 Universe | Market size + category + distributor | Editor | 4 universe + 5×4 category + plans + distributor | Universe KPIs |
| — Stage 4 Sampling | Sampling volume + conversion | Editor | 9 sampling + 5 conversion | Sampling KPIs |
| — Stage 5 Training | Academic interventions | Editor | 8 trainings + 3 assumptions | Training KPIs |
| — Stage 6 Cost | All territory spend (renamed from Investment) | Editor | 12 cost lines | Cost KPIs |
| — Stage 7 Collection | Cash collection plan (auto) | Editor (read-only) | none (auto from target × region %) | 4 milestone values |
| — Stage 8 Review & Submit | Consolidated KPIs + submit/approve | Editor + Approver | Submit / Approve / Reject / Request changes + comment | Status transition, approval log |
| Hiring (`/hiring`) | Manage hiring requests | BDM/ZDM (BDA read-own) | Hiring form; status dropdown (ZDM) | Hiring list, status |
| Dashboard (`/dashboard`) | Performance vs plan | BDA (self) / BDM/ZDM (team) | `?user=` focus | KPIs, target-vs-actual, comparison table, leadership rollup |

Workflow triggers: **Submit** (owner → `submitted`), **Approve/Reject/Request changes**
(manager). Approval steps: owner submit → manager (strict ancestor) decision. No
self-approval.

---

# PHASE 2 — Field Inventory (summary; exhaustive list in `field_inventory.csv`)

Counts by screen/section (every field is enumerated in the CSV):

| Screen | Section | # Fields | Notable hidden/derived |
|--------|---------|----------|------------------------|
| Login | Persona list | 5 | `supabaseConfigured` (env-derived) |
| Home | Filters + card | 13 | `targetAchievementPct` (DERIVED), `primaryActionLabel` (DERIVED) |
| Wizard shell | Header/stepper | 6 | `savedAt`, `readOnly` (DERIVED from status+role) |
| Stage 1 Hiring | Form + list | 12 + 12 | `status` workflow column |
| Stage 2 Revenue | LY (RO) + targets + AOV + calc | 8 + 8 + 4 (calc) | `categoryMismatch` (DERIVED) |
| Stage 3 Universe | Universe + categories + plans + distributor + calc | 4 + (5×4) + 6 + 4 + 4 | **`premiumSchoolStrategy` exists in model but is NOT rendered (orphan field)** |
| Stage 4 Sampling | Volume + conversion + calc | 9 + 5 + 5 | `estimatedConversions` (internal DERIVED) |
| Stage 5 Training | Trainings + assumptions + calc | 8 + 3 + 5 | `costPerSchool` falls back to `activeSchools` |
| Stage 6 Cost | 12 cost lines + calc | 12 + 5 | label "Cost", data key `investment` |
| Stage 7 Collection | Auto milestones | 6 (all DERIVED) | all read-only |
| Stage 8 Review | KPIs + flags + summaries + actions | 8 + n + 6 cards + 5 actions | `version`, `status` |
| Hiring | Form + list card | 11 + 12 | `status` workflow column |
| Dashboard | Individual + team + leadership | ~10 + ~7 + ~4 | `achievedPct`/`actualYTD` (NEEDS_MAPPING) |

**Editable vs read-only:** every planning input on stages 2–6 is editable only when the
AOP status is `draft`/`changes_requested` AND the user is an editor; otherwise read-only
(enforced by `enforce_aop_editable()` trigger + UI banner). Stage 7 is always read-only.

---

# PHASE 3 — Data Source Mapping (summary; exhaustive in `source_mapping.csv`)

Representative rows (full set in CSV — every field appears there):

| Screen | Field | Current Value Logic | Source Table | Source Column | Status |
|--------|-------|---------------------|--------------|---------------|--------|
| Revenue | Last year revenue | `users.current_revenue` (seed constant) | actuals/ERP (TBD) | TO_BE_MAPPED | NEEDS_MAPPING |
| Revenue | Early years revenue (LY) | `lastYear × 0.18` (hard ratio) | actuals/ERP (TBD) | category revenue | NEEDS_MAPPING |
| Revenue | Current AOV | constant ₹145,000 | actuals/ERP (TBD) | TO_BE_MAPPED | NEEDS_MAPPING |
| Revenue | Total revenue target | user input | `revenue_targets` | `total_revenue_target` | CONFIRMED |
| Universe | Active schools | seed constant 110 | school_master (TBD) | count | NEEDS_MAPPING |
| Universe | Category target count | user input | `school_categories` | `target_count` | CONFIRMED |
| Cost | Travel cost | user input | `investment_planning` | `travel_cost` | CONFIRMED |
| Collection | Collection % | region map constant | region_policy (TBD) | `collection_pct` | NEEDS_MAPPING |
| Collection | Collection by Dec | `total × 40%` | n/a (DERIVED) | — | DERIVED |
| Home | Target achievement % | `current_revenue / current_target` | DERIVED (inputs NEEDS_MAPPING) | — | DERIVED |
| Dashboard | YTD actual | demo formula `55+code%40` | actuals/ERP (TBD) | TO_BE_MAPPED | NEEDS_MAPPING |
| Hiring | Territory / District / State | territory lookup | `territories` | name/district/state | LOOKUP |
| Card | Reporting manager | users self-join | `users` | `reporting_manager_id`→`name` | LOOKUP |

---

# PHASE 4 — KPI Inventory (full list in `kpi_inventory.csv`)

All formulas are taken verbatim from `src/lib/calc.ts` (mirrored by SQL view `v_aop_kpis`).

| KPI | Formula | Required Inputs | Source Tables | Status |
|-----|---------|-----------------|---------------|--------|
| Revenue Growth % | `(total_revenue_target − last_year_revenue) / last_year_revenue × 100` | total target, last year revenue | `revenue_targets` (target CONFIRMED; LY NEEDS_MAPPING) | NEEDS_MAPPING (LY input) |
| AOV Growth % | `(target_aov − current_aov) / current_aov × 100` | target AOV, current AOV | `revenue_targets` (current_aov NEEDS_MAPPING) | NEEDS_MAPPING |
| Revenue/School Growth % | `(target_rps − current_rps) / current_rps × 100` | target RPS, current RPS | `revenue_targets` (current_rps NEEDS_MAPPING) | NEEDS_MAPPING |
| School Growth % | `(Σtarget_count − Σcurrent_count) / Σcurrent_count × 100` | category counts | `school_categories` (current counts NEEDS_MAPPING) | NEEDS_MAPPING |
| Retention % | `universe.retention_plan` (direct) | retention plan | `universe_planning` | CONFIRMED |
| Conversion % | `(user_conv% + non_user_conv%) / 2` | conversion inputs | `conversion_planning` | CONFIRMED |
| Cost % of Revenue | `total_cost / total_revenue_target × 100` | total cost, total target | `investment_planning`, `revenue_targets` | CONFIRMED |
| ROI % | `(total_revenue_target / total_cost) × 100` | total target, total cost | same | CONFIRMED |
| Revenue/School | `total_revenue_target / (Σtarget_count or active_schools)` | target, counts | `revenue_targets`, `school_categories`/`universe_planning` | NEEDS_MAPPING (active_schools) |
| Total Sampling Schools | `Σ(7 sampling streams)` | sampling inputs | `sampling_planning` | CONFIRMED |
| Unique Sampling Schools | `round(total × unique_factor)` | total, factor | `sampling_planning` | CONFIRMED |
| Sampling Cost | `total_samples × cost_per_sample` | total, cost/sample | `sampling_planning` | CONFIRMED |
| Cost per Conversion | `sampling_cost / estimated_conversions` | sampling cost, conv | `sampling_planning`, `conversion_planning` | CONFIRMED |
| Revenue per Sample | `sampling_to_revenue_estimate / total_samples` | rev estimate, total | `conversion_planning`, `sampling_planning` | CONFIRMED |
| Training Cost | `total_trainings × cost_per_training` | trainings, cost | `training_planning` | CONFIRMED |
| Cost per School (training) | `training_cost / (user+non-user trainings or active_schools)` | trainings, active | `training_planning`, `universe_planning` | NEEDS_MAPPING (active fallback) |
| Cost per Participant | `training_cost / (total_trainings × participants_per_training)` | trainings, participants | `training_planning` | CONFIRMED |
| Total Cost | `Σ(12 cost lines)` | cost lines | `investment_planning` (generated col) | CONFIRMED |
| ROI (x) | `total_revenue_target / total_cost` | target, cost | same | CONFIRMED |
| Cost per School (cost) | `total_cost / active_schools` | cost, active | `investment_planning`, `universe_planning` | NEEDS_MAPPING (active) |
| Total Collection Target | `total_revenue_target × collection_pct/100` | target, region % | `revenue_targets`, region_policy (TBD) | NEEDS_MAPPING (pct) |
| Collection by Dec/Mar/Apr/Jun | `total_collection × {0.40,0.70,0.85,1.00}` | total collection | DERIVED + phasing constant | NEEDS_INPUT (phasing owner) |
| YTD Achievement % | demo `55 + code%40` | **actuals (none)** | actuals/ERP (TBD) | NEEDS_MAPPING |
| Team plans submitted/approved/at-risk | counts over `aop_master.status` / YTD | statuses, YTD | `aop_master`, actuals (TBD) | NEEDS_MAPPING (at-risk uses YTD) |

---

# PHASE 5 — Calculation Inventory (full list in `calculation_inventory.csv`)

| Calculation | Formula | Variables | Source Tables | Status |
|-------------|---------|-----------|---------------|--------|
| categorySumTarget | `EY+M&S+Other+STEM+Panel targets` | 5 category targets | `revenue_targets` | CONFIRMED |
| categoryMismatch | `total_revenue_target − categorySumTarget` | total + 5 targets | `revenue_targets` | CONFIRMED |
| currentTotalFromCategories | `Σ current_count` | 5 current counts | `school_categories` | NEEDS_MAPPING (counts) |
| targetTotalFromCategories | `Σ target_count` | 5 target counts | `school_categories` | CONFIRMED |
| projectedCategoryRevenue | `Σ projected_revenue` | 5 projected revenue | `school_categories` | CONFIRMED |
| netNewSchools | `new_school_acquisition_plan + active_school_addition_plan` | 2 plans | `universe_planning` | CONFIRMED |
| estimatedConversions | `user_samp×user_conv% + non_user_samp×non_user_conv%` | sampling + conversion | `sampling_planning`,`conversion_planning` | CONFIRMED |
| totalSamplingSchools | `Σ 7 streams` | 7 sampling | `sampling_planning` | CONFIRMED |
| uniqueSamplingSchools | `round(total × unique_factor)` | total, factor | `sampling_planning` | CONFIRMED |
| samplingCost | `total × cost_per_sample` | total, cost | `sampling_planning` | CONFIRMED |
| totalTrainings | `Σ 8 training types` | 8 | `training_planning` | CONFIRMED |
| totalParticipants | `total_trainings × participants_per_training` | trainings, participants | `training_planning` | CONFIRMED |
| totalInvestment (Total Cost) | `Σ 12 cost lines` | 12 | `investment_planning` | CONFIRMED |
| investmentPctOfRevenue | `total_cost / total_target × 100` | cost, target | 2 tables | CONFIRMED |
| roiProjection | `total_target / total_cost` | target, cost | 2 tables | CONFIRMED |
| costPerRevenueUnit | `total_cost / total_target` (4dp) | cost, target | 2 tables | CONFIRMED |
| computeCollection.* | `target × pct × phasing` | target, pct, phasing | `revenue_targets`, region_policy(TBD) | NEEDS_MAPPING |
| Validation flags | mismatch>1 (error); growth>60 (warn); growth<0 (warn); implied rps>aov×50 (warn); new-schools>non_user (error); samples==0 (info) | derived | as above | NEEDS_INPUT (thresholds) |
| Auto-split revenue | `total × (LY_category / Σ LY)` | total, LY splits | `revenue_targets` (LY NEEDS_MAPPING) | NEEDS_MAPPING |

---

# PHASE 6 — Historical Data Requirements (full list in `historical_data_requirements.csv`)

| Field/KPI | Historical Requirement | Logic Required | Source Table |
|-----------|------------------------|----------------|--------------|
| Last year revenue | Prior FY total actual | last completed FY revenue per employee | actuals/ERP — NEEDS_MAPPING |
| LY category revenue (×5) | Prior FY by product category | per-category actual | actuals/ERP — NEEDS_MAPPING |
| Current AOV | Trailing avg order value | Σrevenue / Σorders (period TBD) | actuals/ERP — NEEDS_MAPPING |
| Current revenue/school | Trailing revenue per active school | Σrevenue / active schools | actuals/ERP + school master — NEEDS_MAPPING |
| Universe current counts | Current school master snapshot | count by status/category | school_master — NEEDS_MAPPING |
| `users.current_revenue/target` | Prior period actual + target | per employee | actuals/ERP + target system — NEEDS_MAPPING |
| Dashboard YTD actual | Year-to-date actual | Σ monthly actuals this FY | `actuals_tracking` (empty in demo) — NEEDS_MAPPING |
| Monthly/Quarterly variance | Plan vs actual by period | join plan to `actuals_tracking` | `monthly_reviews`/`quarterly_reviews` (designed, unpopulated) |
| Prior AOP version | Re-plan baseline | `aop_master.version` history | `aop_master` (CONFIRMED design) |

---

# PHASE 7 — Pre-fill Logic Inventory (full list in `prefill_logic_inventory.csv`)

| Field | Entry Type | Pre-fill Logic | Source Table | Source Column |
|-------|-----------|----------------|--------------|---------------|
| Target AOV | Manual (pre-filled) | defaults to `current_aov` (₹145,000 const) | revenue_targets | `target_aov` |
| Target revenue/school | Manual (pre-filled) | defaults to `current_revenue_per_school` (₹240,000 const) | revenue_targets | `target_revenue_per_school` |
| Category target count | Manual (pre-filled) | defaults to `current_count` | school_categories | `target_count` |
| Retention plan % | Manual (pre-filled) | defaults to `85` (const) | universe_planning | `retention_plan` |
| Cost per sample | Manual (pre-filled) | defaults `1200` (const) | sampling_planning | `cost_per_sample` |
| Unique factor | Manual (pre-filled) | defaults `0.7` (const) | sampling_planning | `unique_sampling_factor` |
| Cost per training | Manual (pre-filled) | defaults `8000` (const) | training_planning | `cost_per_training` |
| Participants/training | Manual (pre-filled) | defaults `20` (const) | training_planning | `participants_per_training` |
| Collection % | Auto-populated | `REGION_COLLECTION_PCT[zone]` else 85 | region_policy (TBD) | `collection_pct` — NEEDS_MAPPING |
| Hiring district/state/base | Auto-populated | on territory select, copy from `territories` | territories | district/state/base_location |
| LY revenue + category splits | Auto-populated | `current_revenue × ratios` | actuals/ERP (TBD) — NEEDS_MAPPING | — |
| Category targets (auto-split) | Calculated (button) | `total × LY_share` | revenue_targets | category targets |
| All Stage 7 collection values | Calculated | `target × pct × phasing` | DERIVED | — |
| Reporting manager / territory names | Derived (lookup) | join users/territories | users/territories | name |
| Target achievement % | Calculated | `current_revenue / current_target` | DERIVED | — |

Pre-fill default constants are centralised in `src/lib/mock-data.ts` (`defaultAop`) and
`src/lib/calc.ts` (`REGION_COLLECTION_PCT`, `COLLECTION_PHASING`). **All "current/LY"
defaults are placeholders, not sourced.**

---

# PHASE 8 — Supabase Table Audit (full list in `existing_tables.csv`)

Designed in `supabase/migrations/0001_schema.sql` (18 tables + `v_aop_kpis` view). In demo
mode the app does not query them; in live mode they are the source.

| Existing Table | Purpose | Used By Screens | Required Columns (key) |
|----------------|---------|-----------------|------------------------|
| territories | Territory master | Login, Home, Hiring, Wizard | code, name, district, state, zone, base_location |
| users | Employee master + role + manager + current rev/target | All | employee_code, role, territory_id, reporting_manager_id, current_revenue, current_target |
| employee_hierarchy | Closure for subtree visibility | Home, Dashboard, RLS | ancestor_id, descendant_id, depth |
| aop_master | AOP root per user+FY (status/version) | Wizard, Dashboard | user_id, fy, status, version |
| revenue_targets | Stage 2 | Revenue, Review, Dashboard | total/category targets, target_aov, *LY columns* |
| universe_planning | Stage 3 header | Universe, Dashboard | total/active/user/non_user schools, plans, retention |
| school_categories | Stage 3 rows | Universe | category, current/target_count, projected_revenue/conversion |
| distributor_planning | Stage 3 distributor | Universe | existing/new distributor, opportunities |
| sampling_planning | Stage 4 | Sampling | 7 streams, cost_per_sample, unique_factor |
| conversion_planning | Stage 4 | Sampling | conversion %, estimates |
| training_planning | Stage 5 | Training | 8 types, cost, participants, impact |
| investment_planning | Stage 6 (Cost) | Cost, Review | 12 cost lines, total_investment (gen) |
| hiring_requests | Stage 1 / Hiring | Hiring, Wizard | designation, positions, priority, reason, status |
| approval_workflow | Approval log | Review | action, by_user_id, comment |
| audit_logs | Change log | (cross-cutting) | table_name, record_id, diff |
| actuals_tracking | Monthly actuals | Dashboard/Reviews | revenue_actual, schools, samples, conversions |
| monthly_reviews | Monthly plan vs actual | Reviews (future) | revenue_plan/actual, variance |
| quarterly_reviews | Quarterly plan vs actual | Reviews (future) | revenue_plan/actual, rag_status |

**Orphan/unsurfaced columns flagged:** `universe_planning.premium_school_strategy`
(modelled, not rendered); `actuals_tracking`/`monthly_reviews`/`quarterly_reviews`
(designed, unpopulated — no ingestion source confirmed).

---

# PHASE 9 — New Table Requirements (full list in `proposed_tables.csv`)

Each table challenged before proposing. Existing 18 cover all planning capture; the gaps
below are about **sourcing actuals/historicals and policy**, not convenience.

| Proposed Table | Why Needed | Alternative Considered | Final Decision |
|----------------|-----------|------------------------|----------------|
| `school_master` | Single biggest unknown: universe counts, RPS, dedup, scoring all need real schools, not counts | Keep counts on `universe_planning` | **PROPOSE** — counts cannot represent per-school facts |
| `sales_actuals` (or ERP view) | LY revenue, current AOV/RPS, YTD all need transactional actuals | Reuse `actuals_tracking` | **PROPOSE/INTEGRATE** — `actuals_tracking` is monthly summary; need a confirmed feed/source (ERP) |
| `revenue_phasing` | Monthly target phasing for honest monthly variance | Flat 1/12 split | **PROPOSE** — flat split misleads reviews |
| `region_collection_policy` | Collection % + phasing currently hard-coded | Constants in code | **PROPOSE** — policy must be data, owned by Finance |
| `category_master` | Product categories are enums/strings today | Keep enum | **DEFER** — enum acceptable until categories churn |
| `fiscal_calendar` | FY/period definitions for phasing & reviews | Hard-coded `FY26-27` | **PROPOSE (light)** — needed once multi-FY |
| `hiring_approval` (separate from status) | If hiring needs its own approval chain | Reuse `status` | **DEFER** — single status enum sufficient for v1 |
| Incentive/forecast/scoring tables | Roadmap (Phase 3–5) | — | **DEFER** — out of v1 scope |

---

# PHASE 10 — Relationship Model (full list in `relationship_mapping.csv`)

```
territories (1) ── (N) users                     [1:N]  employees belong to a territory
users (1) ── (N) users (reporting_manager_id)     [1:N]  manager → reports
users (1) ── (N) employee_hierarchy               [N:N]  closure (self+ancestors)
users (1) ── (1) aop_master (per FY)              [1:1 per FY]  one plan per person per year
aop_master (1) ── (1) revenue_targets             [1:1]
aop_master (1) ── (1) universe_planning           [1:1]
aop_master (1) ── (N) school_categories           [1:N]  5 category rows
aop_master (1) ── (1) distributor_planning        [1:1]
aop_master (1) ── (1) sampling_planning           [1:1]
aop_master (1) ── (1) conversion_planning         [1:1]
aop_master (1) ── (1) training_planning           [1:1]
aop_master (1) ── (1) investment_planning         [1:1]
aop_master (1) ── (N) approval_workflow           [1:N]  event log
users (1) ── (N) hiring_requests                  [1:N]  requester
territories (1) ── (N) hiring_requests            [1:N]  for territory
users (1) ── (N) actuals_tracking                 [1:N]  per month
aop_master (1) ── (N) monthly_reviews             [1:N]
aop_master (1) ── (N) quarterly_reviews           [1:N]
-- PROPOSED --
territories/regions (1) ── (N) school_master      [1:N]
school_master (1) ── (N) sales_actuals            [1:N]
region_collection_policy (1) ── (N) territories   [1:N]  by zone
aop_master (1) ── (N) revenue_phasing             [1:N]  monthly target split
```

`collection` is modelled as a 1:1 sub-object on the AOP (only `collection_percent`
stored; milestones are derived) — **note: no `collection_planning` table exists in the
current SQL; it is currently only a TypeScript field.** See Gap Analysis.

---

# PHASE 12 — Gap Analysis

## Known (CONFIRMED) data sources
All **planning inputs** the user types: `revenue_targets`, `universe_planning`,
`school_categories`, `distributor_planning`, `sampling_planning`, `conversion_planning`,
`training_planning`, `investment_planning`, `hiring_requests`, `approval_workflow`,
plus masters `users`, `territories`, `employee_hierarchy`, root `aop_master`. All
all-input KPIs (Cost %, ROI, totals, sampling/training/collection math).

## Unknown data sources (NEEDS_MAPPING)
1. `last_year_revenue` + 5 LY category splits (currently `current_revenue × ratios`).
2. `current_aov`, `current_revenue_per_school` (hard-coded ₹145k / ₹240k).
3. Universe current counts (`total/active/user/non_user_schools`, per-category current).
4. `users.current_revenue`, `users.current_target` (seed constants).
5. Dashboard **YTD actual** + **achievement %** (demo formula).
6. `collection_percent` by region (hard-coded map).
7. `actuals_tracking` feed (table designed, no ingestion source).

## Missing business logic (needs clarification)
- Validation thresholds: 60% aggressive growth, `rps > aov×50`, investment >25% amber — owner & values unconfirmed.
- AOV definition (period, orders denominator) and Revenue/School denominator (active vs total vs target schools — code mixes target then active fallback).
- "active vs user vs total" school definitions for KPIs (which denominator is canonical).

## Missing historical logic
- Period definitions for "current"/"last year"/"YTD" (fiscal calendar).
- LY category split must come from real category-level actuals, not a fixed ratio.
- Monthly target **phasing** (no `revenue_phasing`), so monthly variance has no honest plan baseline.

## Missing tables (pending confirmation)
- `school_master`, `sales_actuals`/ERP feed, `revenue_phasing`, `region_collection_policy`,
  `fiscal_calendar`, and a **`collection_planning` table** to persist Stage 7 (currently TS-only).

## Questions Requiring User Input (each maps to a field/KPI/calc/historical value)
1. **Last year revenue** (Revenue stage): which system/table and which FY window? (field: `revenue_targets.last_year_revenue`)
2. **LY category split** (Revenue): is there category-level actual revenue, or must we keep a ratio? (fields: 5 `*_revenue_ly`)
3. **Current AOV** (Revenue/KPI AOV Growth): exact formula and period (₹/order over which window)? (field: `current_aov`)
4. **Current revenue per school** (Revenue): numerator/denominator and school set (active? user?)? (field: `current_revenue_per_school`)
5. **Universe counts** (Universe): is there a school master? what defines total/active/user/non-user? (fields: 4 universe counts + category current counts)
6. **users.current_revenue / current_target** (Home card, achievement %): source system for prior actual + target? (fields on `users`)
7. **YTD actual & achievement %** (Dashboard): which actuals feed and at what grain (total vs category)? (KPI: YTD achievement)
8. **Collection %** (Collection): confirmed region policy values + owner (Finance)? Is it % of revenue or of orders? (field: `collection_percent`)
9. **Collection phasing** (Collection): are Dec/Mar/Apr/Jun cumulative shares (40/70/85/100) the correct, owned schedule? (fields: 4 milestones)
10. **Persist collection?** Should Stage 7 be stored (new `collection_planning` table) or always recomputed? (table decision)
11. **Revenue/School KPI denominator** (Review/Dashboard): target schools or active schools? (KPI: Revenue/School)
12. **Validation thresholds** (Review flags): confirm 60% growth, ×50 AOV ceiling, 25% cost — values + owner? (calc: flags)
13. **`premium_school_strategy`** (Universe): keep and surface in UI, or drop the column? (orphan field)
14. **Monthly phasing** (Reviews/Forecast): adopt `revenue_phasing` or accept flat 1/12? (table decision)
15. **Actuals ingestion** (Dashboard/Reviews): source, frequency, and grain for `actuals_tracking`? (table feed)
16. **Hiring approval** (Hiring): does hiring need a separate approval chain or is the single status enough? (workflow)
17. **Multi-FY / fiscal calendar** (all "current/last" logic): introduce `fiscal_calendar` now or hard-code FY26-27? (table decision)
18. **Business owners**: name an owner for each master/feed (school master, actuals/ERP, region policy, targets). (governance)
