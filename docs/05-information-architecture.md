# 5. Information Architecture

## Navigation map

```mermaid
flowchart TD
  Login --> Home[Employees - card list]
  Home --> Wizard[AOP wizard /aop/:id]
  Home --> Dash[Dashboard /dashboard]
  Home --> Hiring[Hiring /hiring]
  Wizard --> Review[Review & submit]
  Dash --> Indiv[Individual view ?user=:id]
  Dash --> Team[Team / leadership view]
```

Primary navigation (persistent top bar + mobile bottom nav): **Employees**,
**Dashboard**, **Hiring**. Logout always available.

## Content domains

```mermaid
flowchart LR
  subgraph identity [Identity]
    U[users]
    T[territories]
    H[employee_hierarchy]
  end
  subgraph plan [AOP]
    M[aop_master]
    R[revenue_targets]
    UNI[universe_planning]
    SC[school_categories]
    DP[distributor_planning]
    SP[sampling_planning]
    CP[conversion_planning]
    TP[training_planning]
    IP[investment_planning]
  end
  subgraph process [Process]
    HR[hiring_requests]
    AW[approval_workflow]
    AL[audit_logs]
  end
  subgraph track [Tracking]
    AT[actuals_tracking]
    MR[monthly_reviews]
    QR[quarterly_reviews]
  end
  U --> M
  M --> R & UNI & SC & DP & SP & CP & TP & IP
  M --> AW & AL
  U --> AT --> MR & QR
```

## Object hierarchy
- **User** belongs to one **Territory**, reports to one manager, has a closure of
  ancestors/descendants in **employee_hierarchy**.
- **AOP master** is the root planning object: one per `(user, fiscal_year)`.
- Each planning domain is a child of the AOP master (1:1 except `school_categories`
  which is 1:many).
- **Actuals / reviews** attach to user + fiscal year (and to the AOP for reviews).

## URL scheme
| Route | Screen |
|-------|--------|
| `/login` | Login |
| `/` | Employee card list |
| `/aop/[employeeId]` | AOP wizard for a specific employee |
| `/dashboard` | Role-aware dashboard |
| `/dashboard?user=[id]` | Individual dashboard for a focused user |
| `/hiring` | Hiring requests |

## Information density rules
- One concept per card; calculations always grouped under a "System calculations" or
  "Live calculations" header so users learn what is derived vs input.
- Read-only/auto fields are visually distinct (muted card) from inputs.
