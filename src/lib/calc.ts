// ---------------------------------------------------------------------------
// Calculation engine. Pure functions, no side effects.
// Mirrored on the DB side by the SQL view v_aop_kpis (see migrations).
// All currency values are in INR. Percentages returned as 0-100 numbers.
// ---------------------------------------------------------------------------

import { zoneById } from "./master-data";
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
  const categorySumTarget =
    r.earlyYearsTarget +
    r.mathScienceTarget +
    r.otherCategoriesTarget +
    r.stemTarget +
    r.panelTarget;
  return {
    revenueGrowthPct: round(pct(r.totalRevenueTarget - r.lastYearRevenue, r.lastYearRevenue)),
    aovGrowthPct: round(pct(r.targetAov - r.currentAov, r.currentAov)),
    revenuePerSchoolGrowthPct: round(
      pct(r.targetRevenuePerSchool - r.currentRevenuePerSchool, r.currentRevenuePerSchool),
    ),
    categorySumTarget: round(categorySumTarget),
    categoryMismatch: round(r.totalRevenueTarget - categorySumTarget),
  };
}

// ---- Stage 3: Universe ----
export interface UniverseKpis {
  currentTotalFromCategories: number;
  targetTotalFromCategories: number;
  schoolGrowthPct: number;
  projectedCategoryRevenue: number;
  netNewSchools: number;
}

export function computeUniverseKpis(u: UniversePlanning): UniverseKpis {
  const currentTotalFromCategories = u.categories.reduce((s, c) => s + c.currentCount, 0);
  const targetTotalFromCategories = u.categories.reduce((s, c) => s + c.targetCount, 0);
  const projectedCategoryRevenue = u.categories.reduce((s, c) => s + c.projectedRevenue, 0);
  return {
    currentTotalFromCategories,
    targetTotalFromCategories,
    schoolGrowthPct: round(
      pct(targetTotalFromCategories - currentTotalFromCategories, currentTotalFromCategories),
    ),
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
  investmentPct: number;
  roiPct: number;
  revenuePerSchool: number;
  totalInvestment: number;
  totalRevenueTarget: number;
}

export function computeAopKpis(aop: Aop): AopKpis {
  const rev = computeRevenueKpis(aop.revenue);
  const uni = computeUniverseKpis(aop.universe);
  const samp = computeSamplingKpis(aop.sampling, aop.universe);
  const invKpis = computeInvestmentKpis(
    aop.investment,
    aop.revenue.totalRevenueTarget,
    aop.universe.activeSchools,
  );
  const blendedConversion =
    (aop.sampling.userSchoolConversion + aop.sampling.nonUserSchoolConversion) / 2;
  return {
    revenueGrowthPct: rev.revenueGrowthPct,
    aovGrowthPct: rev.aovGrowthPct,
    schoolGrowthPct: uni.schoolGrowthPct,
    retentionPct: round(aop.universe.retentionPlan),
    conversionPct: round(blendedConversion),
    investmentPct: invKpis.investmentPctOfRevenue,
    roiPct: round(invKpis.roiProjection * 100),
    revenuePerSchool: round(
      safeDiv(aop.revenue.totalRevenueTarget, uni.targetTotalFromCategories || aop.universe.activeSchools),
    ),
    totalInvestment: invKpis.totalInvestment,
    totalRevenueTarget: aop.revenue.totalRevenueTarget,
  };
}

// ---- Collection (auto-calculated, fixed % per region/zone) ----
// Collection % of the year's revenue target that should be realised as cash,
// fixed by region. Milestones use a fixed cumulative phasing schedule.
export const REGION_COLLECTION_PCT: Record<string, number> = {
  North: 85,
  West: 88,
  South: 90,
  East: 86,
};
export const DEFAULT_COLLECTION_PCT = 85;

// Cumulative share of the collection target due by each milestone (fixed).
export const COLLECTION_PHASING = {
  dec: 0.4,
  march: 0.7,
  april: 0.85,
  june: 1.0,
} as const;

export function collectionPercentForZone(zone?: string): number {
  return (zone && REGION_COLLECTION_PCT[zone]) || DEFAULT_COLLECTION_PCT;
}

export interface CollectionKpis {
  collectionPercent: number;
  totalCollectionTarget: number;
  collectionByDec: number;
  collectionByMarch: number;
  collectionByApril: number;
  collectionByJune: number;
}

export function computeCollection(
  totalRevenueTarget: number,
  collectionPercent: number,
): CollectionKpis {
  const totalCollectionTarget = (totalRevenueTarget * collectionPercent) / 100;
  return {
    collectionPercent,
    totalCollectionTarget: round(totalCollectionTarget),
    collectionByDec: round(totalCollectionTarget * COLLECTION_PHASING.dec),
    collectionByMarch: round(totalCollectionTarget * COLLECTION_PHASING.march),
    collectionByApril: round(totalCollectionTarget * COLLECTION_PHASING.april),
    collectionByJune: round(totalCollectionTarget * COLLECTION_PHASING.june),
  };
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
  // Universe ceiling: target revenue per active+new school must be plausible vs AOV
  const totalPlannedSchools =
    aop.universe.activeSchools + aop.universe.newSchoolAcquisitionPlan;
  const impliedRevPerSchool =
    totalPlannedSchools > 0 ? aop.revenue.totalRevenueTarget / totalPlannedSchools : 0;
  if (aop.revenue.targetAov > 0 && impliedRevPerSchool > aop.revenue.targetAov * 50) {
    flags.push({
      level: "warn",
      message: `Implied revenue per school (${Math.round(impliedRevPerSchool).toLocaleString()}) is very high vs target AOV. Universe may be too small for this target.`,
    });
  }
  const samp = computeSamplingKpis(aop.sampling, aop.universe);
  if (
    aop.sampling.samplingToNewSchoolsEstimate >
    aop.universe.nonUserSchools + 0.0001
  ) {
    flags.push({
      level: "error",
      message: `Sampling-to-new-schools estimate (${aop.sampling.samplingToNewSchoolsEstimate}) exceeds available non-user schools (${aop.universe.nonUserSchools}).`,
    });
  }
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
  const cats: SchoolCategoryPlan[] = [
    "Chain Schools",
    "Premium Schools",
    "Category A",
    "Category B",
    "Category C",
  ].map((category) => ({
    category: category as SchoolCategoryPlan["category"],
    currentCount: 0,
    targetCount: 0,
    projectedRevenue: 0,
    projectedConversion: 0,
  }));

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
        cats[i].currentCount += c.currentCount;
        cats[i].targetCount += c.targetCount;
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
      acc.earlyYearsSampling += x.earlyYearsSampling;
      acc.msSampling += x.msSampling;
      acc.stemSampling += x.stemSampling;
      acc.panelSampling += x.panelSampling;
      acc.samplingToRevenueEstimate += x.samplingToRevenueEstimate;
      acc.samplingToOrdersEstimate += x.samplingToOrdersEstimate;
      acc.samplingToNewSchoolsEstimate += x.samplingToNewSchoolsEstimate;
      userConv += x.userSchoolConversion;
      nonUserConv += x.nonUserSchoolConversion;
      return acc;
    },
    {
      userSchoolsSampling: 0,
      nonUserSchoolsSampling: 0,
      testPrepSampling: 0,
      earlyYearsSampling: 0,
      msSampling: 0,
      stemSampling: 0,
      panelSampling: 0,
      costPerSample: aops[0]?.sampling.costPerSample ?? 1200,
      userSchoolConversion: 0,
      nonUserSchoolConversion: 0,
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
  const zone = zoneById(zoneId);
  const collectionPct = zone?.collectionPercent ?? DEFAULT_COLLECTION_PCT;
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
    collection: { collectionPercent: collectionPct },
    approvals: [],
    createdAt: now,
    updatedAt: now,
    updatedByUserId: zdmUserId,
  };
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
    (s, a) => s + a.universe.categories.reduce((c, cat) => c + cat.targetCount, 0),
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
