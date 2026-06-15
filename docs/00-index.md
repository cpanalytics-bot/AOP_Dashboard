# AOP Platform FY26-27 - Design Documentation

Implementation-ready design for the Annual Operating Plan (AOP) platform used by a
nationwide field-sales organization (ZDM -> BDM -> BDA). Mobile-first, web-based,
backed by Supabase (PostgreSQL + Auth + RLS).

## Deliverable sequence

1. [Product Vision](01-product-vision.md)
2. [User Journey](02-user-journey.md)
3. [Role-Based Flow](03-role-based-flow.md)
4. [Screen-by-Screen Wireframe](04-wireframes.md)
5. [Information Architecture](05-information-architecture.md)
6. [Database Schema](06-database-schema.md)
7. [Supabase Table Design](07-supabase-table-design.md)
8. [Validation Rules](08-validation-rules.md)
9. [Calculation Logic](09-calculation-logic.md)
10. [Dashboard Design](10-dashboard-design.md)
11. [Approval Workflow](11-approval-workflow.md)
12. [Reporting Framework](12-reporting-framework.md)
13. [Future Roadmap](13-future-roadmap.md)
14. [Risks & Mitigations](14-risks-mitigations.md)
15. [Recommended Additional Fields](15-additional-fields.md)

## Working prototype

The repository root contains a runnable Next.js + TypeScript + Tailwind prototype that
implements login, the employee card list, the 7-stage AOP wizard with live
calculations, hiring requests, approvals, and role-based dashboards. See the root
[README](../README.md) to run it. SQL for the full schema, RLS, and seed data lives in
[`/supabase`](../supabase).

## Glossary

| Term | Meaning |
|------|---------|
| ZDM | Zonal Development Manager (manages BDMs + BDAs) |
| BDM | Business Development Manager (manages BDAs) |
| BDA | Business Development Associate (territory owner) |
| AOP | Annual Operating Plan |
| AOV | Average Order Value |
| M&S | Math & Science category |
| STEM | STEM product category |
| TOD | Turnover Discount |
| Universe | Total addressable set of schools in a territory |
