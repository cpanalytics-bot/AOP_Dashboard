# 4. Screen-by-Screen Wireframe

Mobile-first (single column, ~390px). Desktop expands to 2-column grids and tables.

## 4.1 Login
```
+--------------------------------+
|            [AOP]               |
|     AOP Platform FY26-27       |
|  [ Demo mode / Connected ]     |
| +----------------------------+ |
| | Quick login                | |
| | ( ) Anita Rao   ZDM        | |
| | ( ) Rohit Mehra BDM        | |
| | ( ) Karan Singh BDA        | |
| | ...                        | |
| | [ Enter platform ]         | |
| +----------------------------+ |
+--------------------------------+
```

## 4.2 Employee card list (home)
```
+--------------------------------+
| Team & AOP status  [+ Hiring]  |
| [search.............] ALL BDM BDA|
| +----------------------------+ |
| | Karan Singh    [Draft]     | |
| | BDA101 - BDA               | |
| | Base: Delhi  Terr: Delhi N | |
| | District: N Delhi  Mgr:Rohit| |
| | Current rev: Rs 2.2 Cr     | |
| | Achievement: 88%  [=====  ]| |
| | [ Continue draft ][Dashboard]|
| +----------------------------+ |
| (more cards...)                |
+--------------------------------+
```
Card fields: name, employee code, designation, base location, territory, district
coverage, reporting manager, current revenue, target achievement % (progress bar).
Primary action label adapts to status: Open AOP / Continue draft / Review plan.

## 4.3 AOP wizard shell
```
+--------------------------------+
| < Back   AOP - Karan Singh     |
| BDA - Delhi North - FY26-27    |
|                     [Draft]    |
| (1 Hiring)(2 Rev)(3 Uni)(4..)  |  <- horizontal stepper
| +----------------------------+ |
| |   ... stage content ...    | |
| +----------------------------+ |
| [Back]   [Save draft] [Next]   |  <- sticky footer
+--------------------------------+
```

## 4.4 Stage 1 - Hiring
Header + (managers) "+ Add request" toggling an inline form; list of requests with
status badges. BDAs see a read-only note + list.

## 4.5 Stage 2 - Revenue
- Read-only historical cards (last year revenue + 5 category splits).
- Target inputs (total + 5 categories).
- AOV/RPS: current (auto) vs target (input).
- Live calc strip: revenue growth %, AOV growth %, category sum, sum-vs-total balance.

## 4.6 Stage 3 - Universe
- Current universe (total/active/user/non-user).
- Category breakup grid (current, target, projected revenue, projected conversion).
- Growth plans (numbers + text strategies).
- Distributor mapping block.

## 4.7 Stage 4 - Sampling & Conversion
- Sampling volume grid (7 streams) + cost-per-sample + unique factor.
- Conversion assumptions.
- System calc strip (total/unique sampling, sampling cost, cost/conversion, rev/sample).

## 4.8 Stage 5 - Training
- 8 training types + assumptions (cost, participants, expected impact).
- System calc strip (total trainings, cost, cost/school, participants, cost/participant).

## 4.9 Stage 6 - Investment
- 12 cost lines.
- System calc strip (total investment, investment % of revenue, ROI, cost/school,
  cost/revenue-unit).

## 4.10 Stage 7 - Review & Submit
- Auto KPI grid (8 KPIs).
- Validation flags (error/warn/info).
- Section summaries (revenue, universe, sampling, training, investment, approval history).
- Actions: editor -> Send for approval (disabled on blocking errors); approver ->
  Approve / Request changes / Reject with comment.

## 4.11 Hiring page
Full list (filtered to the user's chain) + add form; ZDM gets a status dropdown per card.

## 4.12 Dashboard
- Individual (BDA or focused user): target-vs-actual bar, KPI tiles, universe + sampling
  panels.
- Team (BDM/ZDM): summary tiles + comparison table; ZDM adds a leadership rollup card.
```
