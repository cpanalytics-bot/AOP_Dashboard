# AOP Platform FY26-27

A mobile-first, web-based Annual Operating Plan (AOP) platform for a nationwide field
sales organization (ZDM -> BDM -> BDA). Built with **Next.js + TypeScript + Tailwind +
Supabase**.

This repo contains:
- A **working prototype** (login, employee card list, 7-stage AOP wizard with live
  calculations, hiring, approvals, role-based dashboards).
- The full **Supabase schema** (18 tables, RLS, seed) in [`/supabase`](supabase).
- A **15-section design document** in [`/docs`](docs/00-index.md).

## Quick start (demo mode, no backend needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase env vars, the app runs in **demo mode**:
seeded in-memory data + localStorage drafts. Use the quick-login to switch between
personas:

| Persona | Role | Sees |
|---------|------|------|
| Anita Rao | ZDM | whole zone (BDMs + BDAs) |
| Rohit Mehra / Sneha Kulkarni | BDM | their BDA line |
| Karan / Priya / Aman / Meera / Vivek | BDA | own plan only |

Meera Joshi (BDA) has a pre-filled, submitted AOP to demo review/approval and dashboards.

## Try the flow
1. Login as a BDA -> Open AOP -> walk Stages 1-7 -> watch live KPIs -> Submit.
2. Login as that BDA's BDM -> open the submitted plan -> Approve / Request changes / Reject.
3. Open the Dashboard for team comparison; login as ZDM for the leadership rollup.
4. As BDM/ZDM, raise a hiring request from the Hiring tab.

## Connect real Supabase (optional)

1. Create a Supabase project.
2. Run the SQL in order in the SQL editor:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/seed.sql` (demo users; password `Password123!`)
3. Copy env vars:
   ```bash
   cp .env.local.example .env.local
   # fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
4. `npm run dev`. The login screen shows "Connected to Supabase".

## Scripts
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build + type check |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

## Project structure
```
src/
  app/            # routes: login, / (cards), aop/[id], dashboard, hiring
  components/     # AppShell, ui primitives, wizard, hiring form
  lib/
    calc.ts       # calculation engine (mirrors v_aop_kpis)
    validation.ts # Zod schemas + cross-field flags
    types.ts      # domain types
    store.tsx     # client store (auth, data, permissions, persistence)
    mock-data.ts  # demo seed (mirrors seed.sql)
    supabase/     # browser + server clients (live mode)
supabase/
  migrations/     # 0001 schema, 0002 RLS + triggers
  seed.sql        # demo data
docs/             # 15-section design document
```

## Notes
- Demo mode is for evaluation; production uses Supabase Auth + RLS for real security.
- The TypeScript calc engine and the SQL `v_aop_kpis` view implement the same formulas
  (see [docs/09](docs/09-calculation-logic.md)).
