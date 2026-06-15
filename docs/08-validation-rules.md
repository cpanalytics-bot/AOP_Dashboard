# 8. Validation Rules

Goal: **zero dirty data**. Validation is layered - UI (Zod, `src/lib/validation.ts`),
calculation flags (`src/lib/calc.ts`), and database constraints/RLS/triggers.

## 1. Mandatory fields
| Stage | Mandatory |
|-------|-----------|
| Hiring | territory, base location, district, state, designation, positions(>=1), priority, reason, justification(>=20 chars), timeline |
| Revenue | total revenue target (>0), target AOV (>0) |
| Universe | category grid counts (>=0) |
| Sampling | conversion % within 0-100, unique factor 0-1 |
| Investment | each cost line (>=0) |

## 2. Dropdown (enum) fields
Role, AOP status, hiring status/priority/reason, approval action, school category - all
backed by Postgres enums and rendered as selects. Invalid values cannot be persisted.

## 3. Lookup fields
Territory (-> territories), reporting manager (-> users), employee (-> users). Selecting
a territory auto-fills district/state/base location to reduce typing and mismatches.

## 4. Auto-calculated fields (never user-entered)
Revenue growth %, AOV growth %, category sum, all sampling/training/investment totals,
cost-per-X, ROI, investment %, revenue per school. Computed by the engine and DB
generated columns. See [section 9](09-calculation-logic.md).

## 5. Role restrictions
- BDA: own AOP only; cannot raise hiring; cannot approve.
- BDM/ZDM: own + subtree; can fill on behalf, review, approve subordinates, raise hiring.
- Enforced via RLS (`can_access_user` / `can_edit_user`) and app guards.

## 6. Edit restrictions
- Plans are editable only in `draft` / `changes_requested` status.
- Once `submitted`/`in_review`/`approved`, planning tables are locked by the
  `enforce_aop_editable()` trigger; the UI shows a read-only banner.

## 7. Approval restrictions
- No self-approval (owner != approver, owner must be a descendant of approver).
- Only `submit` allowed by the owner; `approve/reject/request_changes` only by a manager
  above the owner.
- Reject requires a comment (UI), request-changes recommended with a comment.

## 8. Duplicate prevention
- `aop_master` UNIQUE `(user_id, fy)` - one plan per person per year.
- `school_categories` UNIQUE `(aop_id, category)`.
- `actuals_tracking` UNIQUE `(user_id, fy, period_month)`.
- `monthly_reviews` UNIQUE `(aop_id, period_month)`, `quarterly_reviews` UNIQUE `(aop_id, quarter)`.
- `users.employee_code` and `users.email` UNIQUE.

## 9. Data quality controls (cross-field / business rules)
Surfaced on the Review screen as error/warn/info flags:
| Flag | Level | Rule |
|------|-------|------|
| Category mismatch | error | sum(category targets) must equal total revenue target |
| Sampling > universe | error | sampling-to-new-schools cannot exceed available non-user schools |
| Aggressive growth | warn | revenue growth > 60% |
| Negative growth | warn | revenue target below last year |
| Universe too small | warn | implied revenue/school >> target AOV |
| High investment | warn | investment % of revenue > 25% |
| No sampling | info | sampling not planned |

**Error-level flags block submission.** Warnings are informational and require the
planner to acknowledge by proceeding.

## Validation timing
- On input: numeric coercion, min/max clamping (percent 0-100).
- On "Next": stage-level Zod schema validation (blocks advance if invalid + not read-only).
- On "Submit": full cross-field flag evaluation; blocking errors disable submit.
- On write: DB constraints, enums, RLS, and triggers as the final backstop.
