// ---------------------------------------------------------------------------
// Calculation engine. Pure functions, no side effects.
// Mirrored on the DB side by the SQL view v_aop_kpis (see migrations).
// All currency values are in INR. Percentages returned as 0-100 numbers.
// ---------------------------------------------------------------------------

import type {
  Aop,
  AopStatus,
  HiringRequest,
  InvestmentPlanning,
  RevenueTargets,
  SamplingPlanning,
  SchoolCategoryPlan,
  TeamDashboardMetrics,
  TrainingPlanning,
  UniversePlanning,
  User,
} from "./types";
import { FY } from "./types";

const safeDiv = (a: number, b: number) => (b ? a / b : 0);
const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
// Treat blank (NaN) as 0 when summing — lets optional fields stay empty.
const fin = (n: number) => (Number.isFinite(n) ? n : 0);
const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

// ---- Stage 2: Revenue ----
export interface RevenueKpis {
  revenueGrowthPct: number;
  aovGrowthPct: number;
  revenuePerSchoolGrowthPct: number;
  categorySumTarget: number;
  categoryMismatch: number; // target - sum of category targets
}

export function computeRevenueKpis(r: RevenueTargets): RevenueKpis {
  // Total revenue target = Early Years + Math & Science + Other Books ONLY.
  // STEM and Panel are optional ADD-ONS, over and above the total — never part
  // of the category-sum balance check.
  const categorySumTarget =
    fin(r.earlyYearsTarget) +
    fin(r.mathScienceTarget) +
    fin(r.otherCategoriesTarget);
  return {
    revenueGrowthPct: round(pct(fin(r.totalRevenueTarget) - fin(r.lastYearRevenue), fin(r.lastYearRevenue))),
    aovGrowthPct: round(pct(fin(r.targetAov) - fin(r.currentAov), fin(r.currentAov))),
    revenuePerSchoolGrowthPct: round(
      pct(fin(r.targetRevenuePerSchool) - fin(r.currentRevenuePerSchool), fin(r.currentRevenuePerSchool)),
    ),
    categorySumTarget: round(categorySumTarget),
    categoryMismatch: round(fin(r.totalRevenueTarget) - categorySumTarget),
  };
}

// ---- Stage 3: Universe ----
export interface UniverseKpis {
  currentTotalFromCategories: number;
  targetTotalFromCategories: number;
  totalSamplingFromCategories: number;
  totalConversionFromCategories: number;
  schoolGrowthPct: number;
  schoolGrowthCount: number;
  projectedCategoryRevenue: number;
  netNewSchools: number;
}

export function computeUniverseKpis(u: UniversePlanning): UniverseKpis {
  const currentTotalFromCategories = u.categories.reduce((s, c) => s + (Number.isFinite(c.currentCount) ? c.currentCount : 0), 0);
  const targetTotalFromCategories = u.categories.reduce((s, c) => s + (Number.isFinite(c.targetCount) ? c.targetCount : 0), 0);
  const totalSamplingFromCategories = u.categories.reduce((s, c) => s + (Number.isFinite(c.samplingCount) ? c.samplingCount : 0), 0);
  const totalConversionFromCategories = u.categories.reduce((s, c) => s + (Number.isFinite(c.conversionCount) ? c.conversionCount : 0), 0);
  const projectedCategoryRevenue = u.categories.reduce((s, c) => s + (Number.isFinite(c.projectedRevenue) ? c.projectedRevenue : 0), 0);
  return {
    currentTotalFromCategories,
    targetTotalFromCategories,
    totalSamplingFromCategories,
    totalConversionFromCategories,
    schoolGrowthPct: round(
      pct(targetTotalFromCategories - currentTotalFromCategories, currentTotalFromCategories),
    ),
    schoolGrowthCount: targetTotalFromCategories - currentTotalFromCategories,
    projectedCategoryRevenue: round(projectedCategoryRevenue),
    netNewSchools: u.newSchoolAcquisitionPlan + u.activeSchoolAdditionPlan,
  };
}

// ---- Stage 4: Sampling & Conversion ----
export interface SamplingKpis {
  totalSamplingSchools: number;
  uniqueSamplingSchools: number;
  samplingCost: number;
  costPerConversion: number;
  revenuePerSample: number;
  estimatedConversions: number;
}

export function computeSamplingKpis(
  s: SamplingPlanning,
  u: UniversePlanning,
): SamplingKpis {
  const totalSamplingSchools =
    s.userSchoolsSampling +
    s.nonUserSchoolsSampling +
    s.testPrepSampling +
    s.earlyYearsSampling +
    s.msSampling +
    s.stemSampling +
    s.panelSampling;
  const uniqueSamplingSchools = Math.round(totalSamplingSchools * (s.uniqueSamplingFactor || 1));
  const samplingCost = totalSamplingSchools * s.costPerSample;
  const estimatedConversions =
    (s.userSchoolsSampling * s.userSchoolConversion) / 100 +
    (s.nonUserSchoolsSampling * s.nonUserSchoolConversion) / 100;
  return {
    totalSamplingSchools,
    uniqueSamplingSchools,
    samplingCost: round(samplingCost),
    costPerConversion: round(safeDiv(samplingCost, estimatedConversions)),
    revenuePerSample: round(safeDiv(s.samplingToRevenueEstimate, totalSamplingSchools)),
    estimatedConversions: round(estimatedConversions),
  };
}

// ---- Stage 5: Training ----
export interface TrainingKpis {
  totalTrainings: number;
  trainingCost: number;
  costPerSchool: number;
  totalParticipants: number;
  costPerParticipant: number;
  expectedRevenueImpact: number;
}

export function computeTrainingKpis(
  t: TrainingPlanning,
  u: UniversePlanning,
): TrainingKpis {
  const totalTrainings =
    t.userSchoolTrainings +
    t.nonUserSchoolTrainings +
    t.digitalTrainings +
    t.physicalTrainings +
    t.teacherWorkshops +
    t.principalWorkshops +
    t.stemWorkshops +
    t.productDemonstrations;
  const trainingCost = totalTrainings * t.costPerTraining;
  const schoolsTouched = t.userSchoolTrainings + t.nonUserSchoolTrainings || u.activeSchools;
  const totalParticipants = totalTrainings * t.participantsPerTraining;
  return {
    totalTrainings,
    trainingCost: round(trainingCost),
    costPerSchool: round(safeDiv(trainingCost, schoolsTouched)),
    totalParticipants,
    costPerParticipant: round(safeDiv(trainingCost, totalParticipants)),
    expectedRevenueImpact: round(t.expectedRevenueImpact),
  };
}

// ---- Stage 6: Investment ----
export interface InvestmentKpis {
  totalInvestment: number;
  investmentPctOfRevenue: number;
  roiProjection: number; // revenue / investment
  costPerSchool: number;
  costPerRevenueUnit: number;
}

export function computeInvestmentKpis(
  inv: InvestmentPlanning,
  totalRevenueTarget: number,
  activeSchools: number,
): InvestmentKpis {
  const totalInvestment =
    inv.samplingCost +
    inv.reimbursementCost +
    inv.travelCost +
    inv.distributorSupportCost +
    inv.eventCost +
    inv.giftCost +
    inv.todCost +
    inv.promotionalCost +
    inv.schemeCost +
    inv.discountCost +
    inv.strategicAccountInvestment +
    inv.otherCost;
  return {
    totalInvestment: round(totalInvestment),
    investmentPctOfRevenue: round(pct(totalInvestment, totalRevenueTarget)),
    roiProjection: round(safeDiv(totalRevenueTarget, totalInvestment)),
    costPerSchool: round(safeDiv(totalInvestment, activeSchools)),
    costPerRevenueUnit: round(safeDiv(totalInvestment, totalRevenueTarget), 4),
  };
}

// ---- Stage 7: Consolidated KPIs ----
export interface AopKpis {
  revenueGrowthPct: number;
  aovGrowthPct: number;
  schoolGrowthPct: number;
  retentionPct: number;
  conversionPct: number;
  revenuePerSchool: number;
  totalRevenueTarget: number;
}

export function computeAopKpis(aop: Aop): AopKpis {
  const rev = computeRevenueKpis(aop.revenue);
  const uni = computeUniverseKpis(aop.universe);
  // Retention % = schools you plan to retain as a share of current USER schools
  // (schools that have already transacted — your existing customer base), NOT all
  // active schools. e.g. retain 15 of 25 user schools = 60%.
  // (Earlier this divided retentionPlanValue (₹) by activeSchools, giving nonsense
  // like 825,688%; then used activeSchools as the base — corrected to userSchools.)
  const retentionCount = Number.isFinite(aop.universe.retentionSchoolCount) ? aop.universe.retentionSchoolCount! : 0;
  const userSchools = Number.isFinite(aop.universe.userSchools) ? aop.universe.userSchools : 0;
  const activeSchools = Number.isFinite(aop.universe.activeSchools) ? aop.universe.activeSchools : 0;
  const retentionPct = userSchools > 0 ? round(pct(retentionCount, userSchools)) : 0;
  const conversionSchools = uni.totalConversionFromCategories;
  const targetSchools = uni.targetTotalFromCategories;
  const conversionPct = targetSchools > 0 ? round(pct(conversionSchools, targetSchools)) : 0;
  return {
    revenueGrowthPct: rev.revenueGrowthPct,
    aovGrowthPct: rev.aovGrowthPct,
    schoolGrowthPct: uni.schoolGrowthPct,
    retentionPct,
    conversionPct,
    revenuePerSchool: round(
      safeDiv(aop.revenue.totalRevenueTarget, uni.targetTotalFromCategories || activeSchools),
    ),
    totalRevenueTarget: aop.revenue.totalRevenueTarget,
  };
}

// ---- Collection (auto-calculated, region + month driven) ----
// The cash collection plan is pre-fetched from a master table: for each
// region we know the cumulative % of the year's revenue target that should
// be realised as cash by each milestone month.
//
// The seed values below are stand-ins for that master table — the final
// numbers will be loaded from the DB once the table is defined.

export interface CollectionMilestone {
  /** Display label for the milestone, e.g. "Till Dec 2026". */
  label: string;
  /** Cumulative % of the year's revenue target collected by this date (0-100). */
  cumulativePct: number;
}

export const REGION_COLLECTION_PHASING: Record<string, CollectionMilestone[]> = {
  North: [
    { label: "Till Dec 2026", cumulativePct: 20 },
    { label: "Till Feb 2027", cumulativePct: 40 },
    { label: "Till May 2027", cumulativePct: 70 },
  ],
  West: [
    { label: "Till Dec 2026", cumulativePct: 22 },
    { label: "Till Feb 2027", cumulativePct: 45 },
    { label: "Till May 2027", cumulativePct: 75 },
  ],
  South: [
    { label: "Till Dec 2026", cumulativePct: 25 },
    { label: "Till Feb 2027", cumulativePct: 50 },
    { label: "Till May 2027", cumulativePct: 78 },
  ],
  East: [
    { label: "Till Dec 2026", cumulativePct: 20 },
    { label: "Till Feb 2027", cumulativePct: 42 },
    { label: "Till May 2027", cumulativePct: 72 },
  ],
};

export const DEFAULT_COLLECTION_PHASING: CollectionMilestone[] = [
  { label: "Till Dec 2026", cumulativePct: 20 },
  { label: "Till Feb 2027", cumulativePct: 40 },
  { label: "Till May 2027", cumulativePct: 70 },
];

export function collectionPhasingForZone(zone?: string): CollectionMilestone[] {
  return (zone && REGION_COLLECTION_PHASING[zone]) || DEFAULT_COLLECTION_PHASING;
}

export interface CollectionKpis {
  totalCollectionTarget: number;
  // Each milestone: cumulative % of the revenue target to be collected by that
  // date, the cumulative INR by then, and the incremental INR for that period.
  milestones: { label: string; cumulativePct: number; amount: number; incremental: number }[];
}

// Collection target = the FULL revenue target (no region % haircut). Milestones
// phase WHEN that cash lands, cumulatively, using the region timing curve.
export function computeCollection(
  totalRevenueTarget: number,
  phasing: CollectionMilestone[] = DEFAULT_COLLECTION_PHASING,
): CollectionKpis {
  const base = fin(totalRevenueTarget);
  let prevCumulative = 0;
  return {
    totalCollectionTarget: round(base),
    milestones: phasing.map((m) => {
      const amount = round((base * m.cumulativePct) / 100);
      const incremental = round(amount - prevCumulative);
      prevCumulative = amount;
      return { label: m.label, cumulativePct: m.cumulativePct, amount, incremental };
    }),
  };
}

// Build the persisted milestone rows (auto) from the region phasing × target.
export function buildCollectionRows(
  totalRevenueTarget: number,
  phasing: CollectionMilestone[] = DEFAULT_COLLECTION_PHASING,
): import("./types").CollectionMilestoneRow[] {
  const { milestones } = computeCollection(totalRevenueTarget, phasing);
  let prevPct = 0;
  return milestones.map((m, i) => {
    const incrementalPct = round(m.cumulativePct - prevPct);
    prevPct = m.cumulativePct;
    return {
      id: `cm-${i}`,
      month: m.label,
      collectionPct: incrementalPct,
      collectionAmount: m.incremental,
      cumulativeAmount: m.amount,
    };
  });
}

// ---- Validation: unrealistic target flagging ----
export interface TargetFlag {
  level: "info" | "warn" | "error";
  message: string;
}

export function flagUnrealisticTargets(aop: Aop): TargetFlag[] {
  const flags: TargetFlag[] = [];
  const rev = computeRevenueKpis(aop.revenue);

  if (Math.abs(rev.categoryMismatch) > 1) {
    flags.push({
      level: "error",
      message: `Category targets (${rev.categorySumTarget.toLocaleString()}) do not sum to Total Revenue Target. Difference: ${rev.categoryMismatch.toLocaleString()}.`,
    });
  }
  if (rev.revenueGrowthPct > 60) {
    flags.push({
      level: "warn",
      message: `Revenue growth of ${rev.revenueGrowthPct}% is aggressive (>60%). Justify with universe expansion or new accounts.`,
    });
  }
  if (rev.revenueGrowthPct < 0) {
    flags.push({
      level: "warn",
      message: `Revenue target is below last year (${rev.revenueGrowthPct}%). Confirm this is intentional (e.g. territory split).`,
    });
  }
  const uni = computeUniverseKpis(aop.universe);
  const targetSchools = uni.targetTotalFromCategories;
  if (targetSchools > 0 && aop.revenue.targetAov > 0) {
    const impliedRevPerSchool = aop.revenue.totalRevenueTarget / targetSchools;
    if (impliedRevPerSchool > aop.revenue.targetAov * 50) {
      flags.push({
        level: "warn",
        message: `Implied revenue per school (${Math.round(impliedRevPerSchool).toLocaleString()}) is very high vs target AOV. Universe may be too small for this target.`,
      });
    }
  }
  const samp = computeSamplingKpis(aop.sampling, aop.universe);
  if (samp.totalSamplingSchools === 0) {
    flags.push({ level: "info", message: "No sampling planned yet." });
  }
  return flags;
}

export const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);

export const fmtPct = (n: number) => `${fmtNum(round(n))}%`;

// ---- ZDM roll-up & dashboard metrics ----

export function deriveRollupStatus(aops: Aop[]): AopStatus {
  if (aops.length === 0) return "not_started";
  if (aops.every((a) => a.status === "approved")) return "approved";
  if (aops.some((a) => a.status === "submitted" || a.status === "in_review")) return "submitted";
  if (aops.some((a) => a.status === "changes_requested")) return "changes_requested";
  if (aops.some((a) => a.status === "rejected")) return "rejected";
  if (aops.some((a) => a.status === "draft")) return "draft";
  return "not_started";
}

function sumRevenue(aops: Aop[]): RevenueTargets {
  const base = aops[0]?.revenue;
  const empty: RevenueTargets = {
    lastYearRevenue: 0,
    earlyYearsRevenueLY: 0,
    mathScienceRevenueLY: 0,
    otherCategoriesRevenueLY: 0,
    stemRevenueLY: 0,
    panelRevenueLY: 0,
    currentAov: base?.currentAov ?? 0,
    currentRevenuePerSchool: base?.currentRevenuePerSchool ?? 0,
    totalRevenueTarget: 0,
    earlyYearsTarget: 0,
    mathScienceTarget: 0,
    otherCategoriesTarget: 0,
    stemTarget: 0,
    panelTarget: 0,
    targetAov: base?.targetAov ?? 0,
    targetRevenuePerSchool: base?.targetRevenuePerSchool ?? 0,
  };
  return aops.reduce((acc, a) => {
    const r = a.revenue;
    acc.lastYearRevenue += r.lastYearRevenue;
    acc.earlyYearsRevenueLY += r.earlyYearsRevenueLY;
    acc.mathScienceRevenueLY += r.mathScienceRevenueLY;
    acc.otherCategoriesRevenueLY += r.otherCategoriesRevenueLY;
    acc.stemRevenueLY += r.stemRevenueLY;
    acc.panelRevenueLY += r.panelRevenueLY;
    acc.totalRevenueTarget += r.totalRevenueTarget;
    acc.earlyYearsTarget += r.earlyYearsTarget;
    acc.mathScienceTarget += r.mathScienceTarget;
    acc.otherCategoriesTarget += r.otherCategoriesTarget;
    acc.stemTarget += r.stemTarget;
    acc.panelTarget += r.panelTarget;
    return acc;
  }, empty);
}

function sumUniverse(aops: Aop[]): UniversePlanning {
  const cats: SchoolCategoryPlan[] = ["A", "B", "C", "D", "Unknown", "Chain"].map(
    (category) => ({
      category,
      currentCount: 0,
      activeCount: 0,
      userCount: 0,
      targetCount: 0,
      samplingCount: 0,
      conversionCount: 0,
      projectedRevenue: 0,
      projectedConversion: 0,
    }),
  );

  let retentionSum = 0;
  const uni = aops.reduce(
    (acc, a) => {
      const u = a.universe;
      acc.totalSchools += u.totalSchools;
      acc.activeSchools += u.activeSchools;
      acc.userSchools += u.userSchools;
      acc.nonUserSchools += u.nonUserSchools;
      acc.activeSchoolAdditionPlan += u.activeSchoolAdditionPlan;
      acc.newSchoolAcquisitionPlan += u.newSchoolAcquisitionPlan;
      retentionSum += u.retentionPlan;
      acc.bulkDealOpportunities += u.bulkDealOpportunities;
      acc.largeInstitutionalOpportunities += u.largeInstitutionalOpportunities;
      u.categories.forEach((c, i) => {
        cats[i].currentCount += fin(c.currentCount);
        cats[i].activeCount += fin(c.activeCount);
        cats[i].userCount += fin(c.userCount);
        cats[i].targetCount += c.targetCount;
        cats[i].samplingCount += (Number.isFinite(c.samplingCount) ? c.samplingCount : 0);
        cats[i].conversionCount += (Number.isFinite(c.conversionCount) ? c.conversionCount : 0);
        cats[i].projectedRevenue += c.projectedRevenue;
        cats[i].projectedConversion += c.projectedConversion;
      });
      return acc;
    },
    {
      totalSchools: 0,
      activeSchools: 0,
      userSchools: 0,
      nonUserSchools: 0,
      activeSchoolAdditionPlan: 0,
      newSchoolAcquisitionPlan: 0,
      retentionPlan: 0,
      keyAccountPlan: "Consolidated from team plans",
      chainSchoolExpansionPlan: "",
      premiumSchoolStrategy: "",
      existingDistributor: "",
      newDistributorRequired: false,
      strategicDistributorOpportunity: "",
      bulkDealOpportunities: 0,
      largeInstitutionalOpportunities: 0,
      categories: cats,
    } as UniversePlanning,
  );
  uni.retentionPlan = aops.length ? retentionSum / aops.length : 0;
  uni.categories = cats.map((c) => ({
    ...c,
    projectedConversion: aops.length ? c.projectedConversion / aops.length : 0,
  }));
  return uni;
}

function sumSampling(aops: Aop[]) {
  let userConv = 0;
  let nonUserConv = 0;
  const s = aops.reduce(
    (acc, a) => {
      const x = a.sampling;
      acc.userSchoolsSampling += x.userSchoolsSampling;
      acc.nonUserSchoolsSampling += x.nonUserSchoolsSampling;
      acc.testPrepSampling += x.testPrepSampling;
      acc.testPrepTeacherCount += x.testPrepTeacherCount;
      acc.earlyYearsSampling += x.earlyYearsSampling;
      acc.msSampling += x.msSampling;
      acc.stemSampling += x.stemSampling;
      acc.panelSampling += x.panelSampling;
      acc.samplingToRevenueEstimate += x.samplingToRevenueEstimate;
      acc.samplingToOrdersEstimate += x.samplingToOrdersEstimate;
      acc.samplingToNewSchoolsEstimate += x.samplingToNewSchoolsEstimate;
      acc.nonUserConversionValue += x.nonUserConversionValue;
      userConv += x.userSchoolConversion;
      nonUserConv += x.nonUserSchoolConversion;
      return acc;
    },
    {
      userSchoolsSampling: 0,
      nonUserSchoolsSampling: 0,
      testPrepSampling: 0,
      testPrepTeacherCount: 0,
      earlyYearsSampling: 0,
      msSampling: 0,
      stemSampling: 0,
      panelSampling: 0,
      costPerSample: aops[0]?.sampling.costPerSample ?? 1200,
      userSchoolConversion: 0,
      nonUserSchoolConversion: 0,
      nonUserConversionValue: 0,
      samplingToRevenueEstimate: 0,
      samplingToOrdersEstimate: 0,
      samplingToNewSchoolsEstimate: 0,
      uniqueSamplingFactor: aops[0]?.sampling.uniqueSamplingFactor ?? 0.7,
    },
  );
  if (aops.length) {
    s.userSchoolConversion = userConv / aops.length;
    s.nonUserSchoolConversion = nonUserConv / aops.length;
  }
  return s;
}

function sumTraining(aops: Aop[]) {
  return aops.reduce(
    (acc, a) => {
      const t = a.training;
      acc.userSchoolTrainings += t.userSchoolTrainings;
      acc.nonUserSchoolTrainings += t.nonUserSchoolTrainings;
      acc.digitalTrainings += t.digitalTrainings;
      acc.physicalTrainings += t.physicalTrainings;
      acc.teacherWorkshops += t.teacherWorkshops;
      acc.principalWorkshops += t.principalWorkshops;
      acc.stemWorkshops += t.stemWorkshops;
      acc.productDemonstrations += t.productDemonstrations;
      acc.expectedRevenueImpact += t.expectedRevenueImpact;
      return acc;
    },
    {
      userSchoolTrainings: 0,
      nonUserSchoolTrainings: 0,
      digitalTrainings: 0,
      physicalTrainings: 0,
      teacherWorkshops: 0,
      principalWorkshops: 0,
      stemWorkshops: 0,
      productDemonstrations: 0,
      costPerTraining: aops[0]?.training.costPerTraining ?? 8000,
      participantsPerTraining: aops[0]?.training.participantsPerTraining ?? 20,
      expectedRevenueImpact: 0,
    },
  );
}

function sumInvestment(aops: Aop[]): InvestmentPlanning {
  const keys: (keyof InvestmentPlanning)[] = [
    "samplingCost",
    "reimbursementCost",
    "travelCost",
    "distributorSupportCost",
    "eventCost",
    "giftCost",
    "todCost",
    "promotionalCost",
    "schemeCost",
    "discountCost",
    "strategicAccountInvestment",
    "otherCost",
  ];
  const inv = {} as InvestmentPlanning;
  for (const k of keys) inv[k] = 0;
  for (const a of aops) {
    for (const k of keys) inv[k] += a.investment[k];
  }
  return inv;
}

export function aggregateTeamAop(
  teamAops: Aop[],
  zdmUserId: string,
  zoneId: string,
): Aop {
  const now = new Date().toISOString();
  const revenue = sumRevenue(teamAops);
  return {
    id: `aop-rollup-${zdmUserId}`,
    userId: zdmUserId,
    fy: FY,
    status: deriveRollupStatus(teamAops),
    version: 1,
    isRollup: true,
    revenue,
    universe: sumUniverse(teamAops),
    sampling: sumSampling(teamAops),
    training: sumTraining(teamAops),
    investment: sumInvestment(teamAops),
    collection: { milestoneRows: [] },
    approvals: [],
    createdAt: now,
    updatedAt: now,
    updatedByUserId: zdmUserId,
  };
}

// ---- AOP completion (heuristic across required signals per stage) ----
// Counts the number of "intent signals" the user has populated. We keep the
// signal list small and decision-relevant so the % moves meaningfully as a
// user progresses, instead of needing every input filled.
export function computeAopCompletion(aop: Aop): {
  pct: number;
  signals: { key: string; label: string; done: boolean }[];
} {
  const r = aop.revenue;
  const u = aop.universe;
  const s = aop.sampling;
  const t = aop.training;

  const signals = [
    { key: "rev_total", label: "Total revenue target", done: r.totalRevenueTarget > 0 },
    { key: "rev_aov", label: "Target AOV", done: r.targetAov > 0 },
    { key: "rev_split", label: "Category split", done:
        fin(r.earlyYearsTarget) + fin(r.mathScienceTarget) + fin(r.otherCategoriesTarget) + fin(r.stemTarget) + fin(r.panelTarget) > 0,
    },
    { key: "uni_retention", label: "Retention school value", done: (u.retentionPlanValue ?? 0) > 0 },
    { key: "uni_categories", label: "School type targets", done: u.categories.some((c) => Number.isFinite(c.targetCount) && c.targetCount > 0) },
    { key: "samp_users", label: "Sampling — user schools", done: s.userSchoolsSampling > 0 },
    { key: "samp_nonusers", label: "Sampling — non-user schools", done: s.nonUserSchoolsSampling > 0 },
    { key: "train_any", label: "Training plan", done:
        t.userSchoolTrainings + t.nonUserSchoolTrainings + t.digitalTrainings + t.physicalTrainings + t.teacherWorkshops + t.principalWorkshops + t.stemWorkshops + t.productDemonstrations > 0,
    },
    { key: "collection", label: "Collection plan", done: Number.isFinite(aop.revenue.totalRevenueTarget) && aop.revenue.totalRevenueTarget > 0 },
  ];

  const done = signals.filter((sig) => sig.done).length;
  return { pct: Math.round((done / signals.length) * 100), signals };
}

export function computeTeamDashboardMetrics(
  team: User[],
  getAopForUser: (id: string) => Aop,
  hiring: HiringRequest[],
): TeamDashboardMetrics {
  const members = team.filter((u) => u.role !== "ZDM");
  const bdms = members.filter((u) => u.role === "BDM");
  const bdas = members.filter((u) => u.role === "BDA");
  const aops = members.map((u) => getAopForUser(u.id));
  const completed = aops.filter((a) => a.status === "approved").length;
  const pending = aops.filter(
    (a) => a.status !== "approved" && a.status !== "not_started",
  ).length;
  const totalRevenue = aops.reduce((s, a) => s + a.revenue.totalRevenueTarget, 0);
  const totalSchools = aops.reduce(
    (s, a) => s + a.universe.categories.reduce((c, cat) => c + (cat.targetCount || 0), 0),
    0,
  );
  const teamIds = new Set(members.map((u) => u.id));
  const totalHiring = hiring
    .filter((h) => h.forUserId && teamIds.has(h.forUserId))
    .reduce((s, h) => s + h.numberOfPositions, 0);

  return {
    totalTeamMembers: members.length,
    totalBdms: bdms.length,
    totalBdas: bdas.length,
    aopCompleted: completed,
    aopPending: pending,
    completionPct: members.length ? round((completed / members.length) * 100) : 0,
    totalRevenuePlanned: totalRevenue,
    totalSchoolsPlanned: totalSchools,
    totalHiringPlanned: totalHiring,
  };
}
