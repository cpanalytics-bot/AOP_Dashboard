import { z } from "zod";

const nonNegative = z.number({ invalid_type_error: "Must be a number" }).min(0, "Must be >= 0");
const positive = z.number({ invalid_type_error: "Must be a number" }).positive("Must be > 0");
const percent = z.number().min(0, "Min 0%").max(100, "Max 100%");

export const hiringSchema = z.object({
  baseLocation: z.string().min(2, "Required"),
  districtIds: z.array(z.string()).min(1, "Select at least one district"),
  forUserId: z.string().nullable().optional(),
  designation: z.string().min(2, "Required"),
  numberOfPositions: z.number().int().min(1, "At least 1 position"),
  priority: z.enum(["Critical", "High", "Medium", "Low"]),
  reason: z.enum([
    "New Territory Expansion",
    "Territory Split",
    "High Potential Market",
    "Backfill",
    "Attrition Replacement",
    "Business Growth",
    "Strategic Account Requirement",
  ]),
  businessJustification: z.string().min(20, "Provide at least 20 characters of justification"),
  expectedRevenueImpact: nonNegative,
  hiringTimeline: z.string().min(1, "Select a month"),
});

export const revenueSchema = z.object({
  totalRevenueTarget: positive,
  earlyYearsTarget: nonNegative,
  mathScienceTarget: nonNegative,
  otherCategoriesTarget: nonNegative,
  stemTarget: nonNegative,
  panelTarget: nonNegative,
  targetAov: positive,
  targetRevenuePerSchool: nonNegative,
});

export const categorySchema = z.object({
  category: z.string(),
  currentCount: nonNegative,
  targetCount: nonNegative,
  projectedRevenue: nonNegative,
  projectedConversion: percent,
});

export const universeSchema = z.object({
  totalSchools: nonNegative,
  activeSchools: nonNegative,
  userSchools: nonNegative,
  nonUserSchools: nonNegative,
  categories: z.array(categorySchema),
  activeSchoolAdditionPlan: nonNegative,
  newSchoolAcquisitionPlan: nonNegative,
  retentionPlan: percent,
  keyAccountPlan: z.string(),
  chainSchoolExpansionPlan: z.string(),
  premiumSchoolStrategy: z.string(),
  existingDistributor: z.string(),
  newDistributorRequired: z.boolean(),
  strategicDistributorOpportunity: z.string(),
  bulkDealOpportunities: nonNegative,
  largeInstitutionalOpportunities: nonNegative,
});

export const samplingSchema = z.object({
  userSchoolsSampling: nonNegative,
  nonUserSchoolsSampling: nonNegative,
  testPrepSampling: nonNegative,
  earlyYearsSampling: nonNegative,
  msSampling: nonNegative,
  stemSampling: nonNegative,
  panelSampling: nonNegative,
  costPerSample: nonNegative,
  userSchoolConversion: percent,
  nonUserSchoolConversion: percent,
  samplingToRevenueEstimate: nonNegative,
  samplingToOrdersEstimate: nonNegative,
  samplingToNewSchoolsEstimate: nonNegative,
  uniqueSamplingFactor: z.number().min(0).max(1),
});

export const trainingSchema = z.object({
  userSchoolTrainings: nonNegative,
  nonUserSchoolTrainings: nonNegative,
  digitalTrainings: nonNegative,
  physicalTrainings: nonNegative,
  teacherWorkshops: nonNegative,
  principalWorkshops: nonNegative,
  stemWorkshops: nonNegative,
  productDemonstrations: nonNegative,
  costPerTraining: nonNegative,
  participantsPerTraining: nonNegative,
  expectedRevenueImpact: nonNegative,
});

export const investmentSchema = z.object({
  samplingCost: nonNegative,
  reimbursementCost: nonNegative,
  travelCost: nonNegative,
  distributorSupportCost: nonNegative,
  eventCost: nonNegative,
  giftCost: nonNegative,
  todCost: nonNegative,
  promotionalCost: nonNegative,
  schemeCost: nonNegative,
  discountCost: nonNegative,
  strategicAccountInvestment: nonNegative,
  otherCost: nonNegative,
});

export type StageKey =
  | "revenue"
  | "universe"
  | "sampling"
  | "training"
  | "investment";

export const stageSchemas: Record<StageKey, z.ZodTypeAny> = {
  revenue: revenueSchema,
  universe: universeSchema,
  sampling: samplingSchema,
  training: trainingSchema,
  investment: investmentSchema,
};

export function validateStage(stage: StageKey, data: unknown) {
  const result = stageSchemas[stage].safeParse(data);
  if (result.success) return { ok: true as const, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false as const, errors };
}
