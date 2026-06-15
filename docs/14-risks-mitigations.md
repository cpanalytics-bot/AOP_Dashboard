# 14. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|------------|
| 1 | Dirty / inconsistent data from free-form entry | High | High | Enums, lookups, calc engine, cross-field validation flags, DB constraints (section 8) |
| 2 | Low field adoption (plans done in Excel anyway) | High | Med | Mobile-first UX, auto-save drafts, live KPIs, single-thumb flow, delegation by managers |
| 3 | Unrealistic / sandbagged targets | High | Med | Growth/universe ceiling flags, manager approval gate, category-sum reconciliation |
| 4 | Plan edited after submission | Med | Med | Edit-lock triggers + status machine; changes only via `request_changes` |
| 5 | Unauthorized cross-territory access | High | Low | RLS with hierarchy closure; no client-trusted authorization |
| 6 | Self-approval / weak governance | Med | Med | DB-enforced no-self-approval; append-only approval log |
| 7 | Hierarchy changes mid-year (re-orgs) | Med | High | Closure table rebuildable; AOP keyed to user+FY; version field for re-plan |
| 8 | Plan vs actual drift (no tracking) | High | Med | Shared dimensions; `actuals_tracking` monthly; variance model |
| 9 | Performance at national scale | Med | Low | Indexes on all FKs/filters; closure table for O(1)-ish subtree; generated columns/views |
| 10 | Calc divergence (TS vs SQL) | Med | Low | Single formula spec (section 9); regression test comparing `calc.ts` vs `v_aop_kpis` |
| 11 | Data loss in demo mode | Low | Med | localStorage persistence; clear "demo mode" badge; production uses Supabase |
| 12 | Supabase misconfig / secrets leak | High | Low | Service-role key server-only; anon key + RLS for client; `.env.local` gitignored |
| 13 | Currency/locale formatting errors | Low | Med | Centralized `fmtINR`/`fmtNum`/`fmtPct` helpers (en-IN) |
| 14 | Incomplete plans at deadline | Med | High | Plan-completion dashboard, status counts, manager nudges/notifications |

## Operational safeguards
- Backups + point-in-time recovery (Supabase).
- Staging project mirrors RLS before production rollout.
- Feature flags for phased dashboard/feature release.
