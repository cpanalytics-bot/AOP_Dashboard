# AOP Platform — Enterprise Redesign

This document summarizes the architecture implemented in the enterprise redesign.

## Ownership model

- **ZDM**: Sole editor for all BDM/BDA AOPs in their subtree. Can edit employee profiles, assign districts, and raise hiring requests.
- **ZDM zone AOP**: Auto-derived roll-up (sum of team plans). Read-only; not manually filled.
- **BDM / BDA**: View-only for AOP, targets, hiring, and profiles.
- **ADMIN**: Full org visibility via `/admin` with export and audit log.

## Navigation

| Route | Role | Purpose |
|-------|------|---------|
| `/login` | All | Email-based sign-in |
| `/` | ZDM | Command dashboard (9 cards + team table) |
| `/view` | BDM, BDA | Read-only team/self view |
| `/admin` | ADMIN | Organization summaries + export |
| `/aop/[id]` | Scoped | Wizard + employee profile |
| `/hiring` | Scoped | Hiring list; `?user=` for employee scope |

## Data model

```
zones → districts → blocks (master)
users → employee_districts → districts (M:N)
users → aop_master → planning tables (1:1 / 1:N)
ZDM → v_zdm_rollup_aop (derived view)
```

Territories removed. District multi-select drives block coverage automatically.

## Demo accounts

| Email | Role |
|-------|------|
| admin@org.com | ADMIN |
| anita.rao@org.com | ZDM |
| rohit.mehra@org.com | BDM |
| karan.singh@org.com | BDA |

## CSV import (future)

When the real districts/blocks file is provided, import into `districts` and `blocks` tables. See `scripts/import-districts.ts` stub.

## API routes (Phase 2 — Supabase live)

Documented in the implementation plan: `/api/auth/login`, `/api/dashboard/metrics`, `/api/users/[id]`, `/api/aop/[userId]`, `/api/admin/summary`, `/api/export/[type]`.
