# 7. Supabase Table Design

This section covers the Supabase-specific implementation details on top of the logical
schema in [section 6](06-database-schema.md). Source of truth:
[`0001_schema.sql`](../supabase/migrations/0001_schema.sql),
[`0002_rls.sql`](../supabase/migrations/0002_rls.sql),
[`seed.sql`](../supabase/seed.sql).

## Auth mapping
- `public.users.id` is a FK to `auth.users.id` (1:1). On user signup, a trigger or the
  admin onboarding flow inserts the matching `public.users` row with role, territory, and
  manager. Demo seed inserts both directly.
- `auth.uid()` is used throughout RLS to identify the current user.

## Enums (typed dropdowns at the DB level)
`role_t`, `aop_status_t`, `hiring_status_t`, `hiring_priority_t`, `hiring_reason_t`,
`approval_action_t`, `school_category_t`. Using enums prevents invalid dropdown values
from ever entering the database (data-quality control #2).

## Generated (computed) columns
Pushed to the DB so they cannot drift from inputs and are queryable:
- `revenue_targets.revenue_growth_pct`, `revenue_targets.category_sum_target`
- `sampling_planning.total_sampling_schools`
- `training_planning.total_trainings`
- `investment_planning.total_investment`

The full KPI set is exposed via the `v_aop_kpis` view (mirrors `src/lib/calc.ts`).

## Row Level Security
RLS is enabled on all 18 tables. Helper functions (security definer):
- `can_access_user(target)` - true if target is self or a strict descendant.
- `can_edit_user(target)` - self, or a descendant when the current user is BDM/ZDM.
- `aop_owner(aop_id)` - resolves the owning user for child-table policies.

Policy pattern per planning table:
```sql
create policy x_read  on <t> for select using (can_access_user(aop_owner(aop_id)));
create policy x_write on <t> for all    using (can_edit_user(aop_owner(aop_id)))
                                        with check (can_edit_user(aop_owner(aop_id)));
```

Approval insert policy enforces the no-self-approval rule:
```sql
(action = 'submit' and aop_owner(aop_id) = auth.uid())
or (action in ('approve','reject','request_changes')
    and aop_owner(aop_id) <> auth.uid()
    and can_edit_user(aop_owner(aop_id)))
```

Hiring insert requires the requester to be the current user AND a BDM/ZDM.

## Edit-lock triggers
`enforce_aop_editable()` is a BEFORE INSERT/UPDATE trigger on all planning tables. It
raises an exception if the parent `aop_master.status` is `submitted`, `in_review`, or
`approved`. To edit, a manager must `request_changes`, which sets status back to
`draft`/`changes_requested`. This guarantees plans cannot be silently altered after
submission (edit restriction + audit integrity).

## Indexing strategy
- All FK columns used in joins/filters are indexed (`aop_id`, `user_id`, `territory_id`,
  `reporting_manager_id`, `status`, `fy`).
- Closure table indexed on `descendant_id` for "who is my manager chain" lookups.
- Tracking tables indexed on `(user_id, fy)` for time-series reads.

## Recommended extras (production)
- `updated_at` auto-touch trigger (or `moddatetime` extension) on mutable tables.
- A generic `audit_logs` trigger function capturing `to_jsonb(NEW)` diffs for sensitive
  tables.
- Supabase Realtime on `aop_master` and `approval_workflow` for live status updates in
  manager dashboards.
- Scheduled `pg_cron` job to snapshot `monthly_reviews` from `actuals_tracking`.

## Prototype data layer
The prototype ships with a graceful fallback: when `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent it runs in MOCK mode (seeded in-memory data +
localStorage drafts) so the UI is fully demoable without a backend. The Supabase client
modules (`src/lib/supabase/*`) and the SQL above are the wiring for live mode.
