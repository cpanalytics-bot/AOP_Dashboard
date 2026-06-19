import { z } from "zod";

// Mandatory numeric: must be a real entered number (blank = NaN → fails).
const reqNum = z.number().refine((v) => Number.isFinite(v), "Required");
const reqPct = z
  .number()
  .refine((v) => Number.isFinite(v), "Required")
  .refine((v) => v >= 0 && v <= 100, "Enter 0–100");
// Lenient (auto/derived fields we don't force the user to fill).
const auto = z.number().or(z.nan());

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
  expectedRevenueImpact: z.number().min(0, "Must be >= 0"),
  hiringTimeline: z.string().min(1, "Select a month"),
});

// All user-entered fields are mandatory.
export const revenueSchema = z.object({
  totalRevenueTarget: reqNum,
  earlyYearsTarget: reqNum,
  mathScienceTarget: reqNum,
  otherCategoriesTarget: reqNum,
  stemTarget: reqNum,
  panelTarget: reqNum,
  targetAov: reqNum,
});

export const categorySchema = z.object({
  category: z.string(),
  currentCount: auto,
  targetCount: reqNum,
  projectedRevenue: auto, // auto-computed (target × conv% × AOV)
  projectedConversion: reqPct,
});

export const universeSchema = z.object({
  categories: z.array(categorySchema),
  retentionPlan: reqPct,
  retentionPlanValue: reqNum,
  bulkDealOpportunities: reqNum,
});

export const samplingSchema = z.object({
  userSchoolsSampling: reqNum,
  nonUserSchoolsSampling: reqNum,
  testPrepSampling: reqNum,
  earlyYearsSampling: reqNum,
  msSampling: reqNum,
  stemSampling: reqNum,
  panelSampling: reqNum,
  nonUserSchoolConversion: reqPct,
  nonUserConversionValue: reqNum,
  samplingToOrdersEstimate: reqNum,
  samplingToNewSchoolsEstimate: reqNum,
});

export const trainingSchema = z.object({
  userSchoolTrainings: reqNum,
  nonUserSchoolTrainings: reqNum,
  digitalTrainings: reqNum,
  physicalTrainings: reqNum,
  teacherWorkshops: reqNum,
  principalWorkshops: reqNum,
  stemWorkshops: reqNum,
  productDemonstrations: reqNum,
});

export const investmentSchema = z.object({
  samplingCost: reqNum,
  reimbursementCost: reqNum,
  travelCost: reqNum,
  distributorSupportCost: reqNum,
  eventCost: reqNum,
  giftCost: reqNum,
  todCost: reqNum,
  promotionalCost: reqNum,
  discountCost: reqNum,
  otherCost: reqNum,
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
