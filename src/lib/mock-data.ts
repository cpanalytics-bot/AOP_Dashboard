import type { Aop, HiringRequest, User } from "./types";
import { FY } from "./types";
import { zoneById } from "./master-data";

// ---------------------------------------------------------------------------
// Seed data used in MOCK mode (no Supabase configured).
// ---------------------------------------------------------------------------

export const users: User[] = [
  {
    id: "u-admin-1",
    employeeCode: "ADM001",
    name: "System Admin",
    email: "admin@org.com",
    role: "ADMIN",
    designation: "Platform Administrator",
    baseLocation: "Head Office",
    zoneId: "z-north",
    districtIds: [],
    reportingManagerId: null,
    currentRevenue: 0,
    currentTarget: 0,
    isActive: true,
  },
  {
    id: "u-zdm-1",
    employeeCode: "ZDM001",
    name: "Anita Rao",
    email: "anita.rao@org.com",
    role: "ZDM",
    designation: "Zonal Development Manager",
    baseLocation: "Delhi",
    zoneId: "z-north",
    districtIds: ["d-del-n", "d-del-s", "d-gzb", "d-mum-w", "d-pune"],
    reportingManagerId: null,
    currentRevenue: 145_000_000,
    currentTarget: 160_000_000,
    isActive: true,
  },
  {
    id: "u-bdm-1",
    employeeCode: "BDM010",
    name: "Rohit Mehra",
    email: "rohit.mehra@org.com",
    role: "BDM",
    designation: "Business Development Manager",
    baseLocation: "Delhi",
    zoneId: "z-north",
    districtIds: ["d-del-n", "d-del-s", "d-gzb"],
    reportingManagerId: "u-zdm-1",
    currentRevenue: 62_000_000,
    currentTarget: 70_000_000,
    isActive: true,
  },
  {
    id: "u-bdm-2",
    employeeCode: "BDM011",
    name: "Sneha Kulkarni",
    email: "sneha.k@org.com",
    role: "BDM",
    designation: "Business Development Manager",
    baseLocation: "Mumbai",
    zoneId: "z-west",
    districtIds: ["d-mum-w", "d-pune"],
    reportingManagerId: "u-zdm-1",
    currentRevenue: 58_000_000,
    currentTarget: 65_000_000,
    isActive: true,
  },
  {
    id: "u-bda-1",
    employeeCode: "BDA101",
    name: "Karan Singh",
    email: "karan.singh@org.com",
    role: "BDA",
    designation: "Business Development Associate",
    baseLocation: "Delhi",
    zoneId: "z-north",
    districtIds: ["d-del-n"],
    reportingManagerId: "u-bdm-1",
    currentRevenue: 22_000_000,
    currentTarget: 25_000_000,
    isActive: true,
  },
  {
    id: "u-bda-2",
    employeeCode: "BDA102",
    name: "Priya Nair",
    email: "priya.nair@org.com",
    role: "BDA",
    designation: "Business Development Associate",
    baseLocation: "Delhi",
    zoneId: "z-north",
    districtIds: ["d-del-s"],
    reportingManagerId: "u-bdm-1",
    currentRevenue: 19_500_000,
    currentTarget: 22_000_000,
    isActive: true,
  },
  {
    id: "u-bda-3",
    employeeCode: "BDA103",
    name: "Aman Gupta",
    email: "aman.gupta@org.com",
    role: "BDA",
    designation: "Business Development Associate",
    baseLocation: "Ghaziabad",
    zoneId: "z-north",
    districtIds: ["d-gzb"],
    reportingManagerId: "u-bdm-1",
    currentRevenue: 20_500_000,
    currentTarget: 23_000_000,
    isActive: true,
  },
  {
    id: "u-bda-4",
    employeeCode: "BDA104",
    name: "Meera Joshi",
    email: "meera.joshi@org.com",
    role: "BDA",
    designation: "Business Development Associate",
    baseLocation: "Mumbai",
    zoneId: "z-west",
    districtIds: ["d-mum-w"],
    reportingManagerId: "u-bdm-2",
    currentRevenue: 28_000_000,
    currentTarget: 30_000_000,
    isActive: true,
  },
  {
    id: "u-bda-5",
    employeeCode: "BDA105",
    name: "Vivek Patil",
    email: "vivek.patil@org.com",
    role: "BDA",
    designation: "Business Development Associate",
    baseLocation: "Pune",
    zoneId: "z-west",
    districtIds: ["d-pune"],
    reportingManagerId: "u-bdm-2",
    currentRevenue: 24_000_000,
    currentTarget: 27_000_000,
    isActive: true,
  },
];

export function defaultAop(userId: string): Aop {
  const u = users.find((x) => x.id === userId)!;
  const lastYear = u?.currentRevenue ?? 0;
  const zone = zoneById(u?.zoneId ?? "");
  const collectionPct = zone?.collectionPercent ?? 85;
  const now = new Date().toISOString();
  return {
    id: `aop-${userId}`,
    userId,
    fy: FY,
    status: "not_started",
    version: 1,
    revenue: {
      lastYearRevenue: lastYear,
      earlyYearsRevenueLY: Math.round(lastYear * 0.18),
      mathScienceRevenueLY: Math.round(lastYear * 0.32),
      otherCategoriesRevenueLY: Math.round(lastYear * 0.15),
      stemRevenueLY: Math.round(lastYear * 0.2),
      panelRevenueLY: Math.round(lastYear * 0.15),
      currentAov: NaN, // filled from live snapshot (real AOV); was a hardcoded 145000
      currentRevenuePerSchool: 240000,
      // User-input fields start blank (NaN) — see NumberInput. Mandatory at submit.
      totalRevenueTarget: NaN,
      earlyYearsTarget: NaN,
      mathScienceTarget: NaN,
      otherCategoriesTarget: NaN,
      stemTarget: NaN,
      panelTarget: NaN,
      targetAov: NaN,
      targetRevenuePerSchool: 240000,
    },
    universe: {
      // Auto counts come from the live school snapshot; blank so snapshot wins.
      totalSchools: NaN,
      activeSchools: NaN,
      userSchools: NaN,
      nonUserSchools: NaN,
      categories: [
        { category: "A", currentCount: 30, targetCount: NaN, projectedRevenue: NaN, projectedConversion: NaN },
        { category: "B", currentCount: 28, targetCount: NaN, projectedRevenue: NaN, projectedConversion: NaN },
        { category: "C", currentCount: 22, targetCount: NaN, projectedRevenue: NaN, projectedConversion: NaN },
        { category: "D", currentCount: 0, targetCount: NaN, projectedRevenue: NaN, projectedConversion: NaN },
        { category: "Uncategorized", currentCount: 0, targetCount: NaN, projectedRevenue: NaN, projectedConversion: NaN },
        { category: "Chain", currentCount: 0, targetCount: NaN, projectedRevenue: NaN, projectedConversion: NaN },
      ],
      activeSchoolAdditionPlan: 0,
      newSchoolAcquisitionPlan: 0,
      retentionPlan: NaN,
      retentionPlanValue: NaN,
      keyAccountPlan: "",
      chainSchoolExpansionPlan: "",
      premiumSchoolStrategy: "",
      existingDistributor: "",
      newDistributorRequired: false,
      strategicDistributorOpportunity: "",
      bulkDealOpportunities: NaN,
      largeInstitutionalOpportunities: 0,
    },
    sampling: {
      userSchoolsSampling: NaN,
      nonUserSchoolsSampling: NaN,
      testPrepSampling: NaN,
      earlyYearsSampling: NaN,
      msSampling: NaN,
      stemSampling: NaN,
      panelSampling: NaN,
      costPerSample: 1200,
      userSchoolConversion: 0,
      nonUserSchoolConversion: NaN,
      nonUserConversionValue: NaN,
      samplingToRevenueEstimate: 0,
      samplingToOrdersEstimate: NaN,
      samplingToNewSchoolsEstimate: NaN,
      uniqueSamplingFactor: 0.7,
    },
    training: {
      userSchoolTrainings: NaN,
      nonUserSchoolTrainings: NaN,
      digitalTrainings: NaN,
      physicalTrainings: NaN,
      teacherWorkshops: NaN,
      principalWorkshops: NaN,
      stemWorkshops: NaN,
      productDemonstrations: NaN,
      costPerTraining: 8000,
      participantsPerTraining: 20,
      expectedRevenueImpact: 0,
    },
    investment: {
      samplingCost: NaN,
      reimbursementCost: NaN,
      travelCost: NaN,
      distributorSupportCost: NaN,
      eventCost: NaN,
      giftCost: NaN,
      todCost: NaN,
      promotionalCost: NaN,
      schemeCost: 0,
      discountCost: NaN,
      strategicAccountInvestment: 0,
      otherCost: NaN,
    },
    collection: { collectionPercent: collectionPct },
    approvals: [],
    createdAt: now,
    updatedAt: now,
    updatedByUserId: userId,
  };
}

export function seededAops(): Record<string, Aop> {
  const map: Record<string, Aop> = {};
  const a = defaultAop("u-bda-4");
  a.status = "submitted";
  a.revenue.totalRevenueTarget = 34_000_000;
  a.revenue.earlyYearsTarget = 6_000_000;
  a.revenue.mathScienceTarget = 12_000_000;
  a.revenue.otherCategoriesTarget = 5_000_000;
  a.revenue.stemTarget = 7_000_000;
  a.revenue.panelTarget = 4_000_000;
  a.revenue.targetAov = 165_000;
  a.revenue.targetRevenuePerSchool = 290_000;
  a.universe.categories = a.universe.categories.map((c) => ({
    ...c,
    targetCount: c.currentCount + 4,
    projectedRevenue: 6_000_000,
    projectedConversion: 35,
  }));
  a.universe.newSchoolAcquisitionPlan = 18;
  a.universe.activeSchoolAdditionPlan = 12;
  a.universe.retentionPlan = 88;
  a.sampling.userSchoolsSampling = 60;
  a.sampling.nonUserSchoolsSampling = 120;
  a.sampling.userSchoolConversion = 45;
  a.sampling.nonUserSchoolConversion = 18;
  a.sampling.samplingToRevenueEstimate = 9_000_000;
  a.sampling.samplingToOrdersEstimate = 140;
  a.sampling.samplingToNewSchoolsEstimate = 22;
  a.training.userSchoolTrainings = 40;
  a.training.teacherWorkshops = 25;
  a.training.expectedRevenueImpact = 3_000_000;
  a.investment.samplingCost = 1_200_000;
  a.investment.travelCost = 600_000;
  a.investment.eventCost = 400_000;
  a.investment.promotionalCost = 300_000;
  a.investment.discountCost = 500_000;
  a.approvals.push({
    id: "ap-seed-1",
    aopId: a.id,
    action: "submit",
    byUserId: "u-zdm-1",
    comment: "Submitted by ZDM on behalf of team member.",
    createdAt: new Date().toISOString(),
  });
  map[a.userId] = a;

  const bdm1 = defaultAop("u-bdm-1");
  bdm1.status = "draft";
  bdm1.revenue.totalRevenueTarget = 75_000_000;
  bdm1.revenue.earlyYearsTarget = 12_000_000;
  bdm1.revenue.mathScienceTarget = 25_000_000;
  map[bdm1.userId] = bdm1;

  return map;
}

export const seedHiringRequests: HiringRequest[] = [
  {
    id: "h-seed-1",
    requestedByUserId: "u-zdm-1",
    forUserId: "u-bdm-1",
    districtIds: ["d-gzb"],
    baseLocation: "Ghaziabad",
    designation: "BDA",
    numberOfPositions: 1,
    priority: "High",
    reason: "Territory Split",
    businessJustification:
      "Ghaziabad universe has grown beyond a single BDA capacity; splitting to protect retention and accelerate new-school acquisition.",
    expectedRevenueImpact: 8_000_000,
    hiringTimeline: "2026-07",
    status: "Requested",
    createdAt: new Date().toISOString(),
  },
];
