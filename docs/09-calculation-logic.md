# 9. Calculation Logic

Single source of truth: [`src/lib/calc.ts`](../src/lib/calc.ts), mirrored in SQL by the
`v_aop_kpis` view and generated columns. All money in INR; percentages as 0-100.

Helpers: `safeDiv(a,b)` (0 when b=0), `pct(part,whole)`, `round(n,d)`.

## Stage 2 - Revenue
```
revenueGrowthPct       = (totalRevenueTarget - lastYearRevenue) / lastYearRevenue * 100
aovGrowthPct           = (targetAov - currentAov) / currentAov * 100
revenuePerSchoolGrowth = (targetRPS - currentRPS) / currentRPS * 100
categorySumTarget      = earlyYears + mathScience + otherCategories + stem + panel
categoryMismatch       = totalRevenueTarget - categorySumTarget   (must be 0)
```

## Stage 3 - Universe
```
currentTotalFromCategories = sum(category.currentCount)
targetTotalFromCategories  = sum(category.targetCount)
schoolGrowthPct            = (targetTotal - currentTotal) / currentTotal * 100
projectedCategoryRevenue   = sum(category.projectedRevenue)
netNewSchools              = newSchoolAcquisitionPlan + activeSchoolAdditionPlan
```

## Stage 4 - Sampling & Conversion
```
totalSamplingSchools  = userSchools + nonUserSchools + testPrep + earlyYears + ms + stem + panel
uniqueSamplingSchools = round(totalSamplingSchools * uniqueSamplingFactor)
samplingCost          = totalSamplingSchools * costPerSample
estimatedConversions  = userSchoolsSampling * userConv%   + nonUserSchoolsSampling * nonUserConv%
costPerConversion     = samplingCost / estimatedConversions
revenuePerSample      = samplingToRevenueEstimate / totalSamplingSchools
```

## Stage 5 - Training
```
totalTrainings    = sum(8 training types)
trainingCost      = totalTrainings * costPerTraining
costPerSchool     = trainingCost / (userSchoolTrainings + nonUserSchoolTrainings or activeSchools)
totalParticipants = totalTrainings * participantsPerTraining
costPerParticipant= trainingCost / totalParticipants
```

## Stage 6 - Investment
```
totalInvestment       = sum(12 cost lines)
investmentPctOfRevenue= totalInvestment / totalRevenueTarget * 100
roiProjection         = totalRevenueTarget / totalInvestment        (x multiple)
costPerSchool         = totalInvestment / activeSchools
costPerRevenueUnit    = totalInvestment / totalRevenueTarget
```

## Stage 7 - Consolidated KPIs (`computeAopKpis`)
```
revenueGrowthPct  (from Stage 2)
aovGrowthPct      (from Stage 2)
schoolGrowthPct   (from Stage 3)
retentionPct      = universe.retentionPlan
conversionPct     = avg(userConv%, nonUserConv%)
investmentPct     = investment % of revenue
roiPct            = roiProjection * 100
revenuePerSchool  = totalRevenueTarget / targetTotalSchools (fallback activeSchools)
```

## Validation flags (`flagUnrealisticTargets`)
See [section 8.9](08-validation-rules.md). Error flags block submission; warns/infos are
advisory.

## Why duplicate in SQL?
The TS engine gives instant in-form feedback; the SQL generated columns + `v_aop_kpis`
let dashboards, reports, and ad-hoc queries read consistent KPIs without a round-trip to
the app. Keeping both in lockstep is a test target (compare `calc.ts` output vs the view
for seeded plans).
