import { z } from "zod";

// Mandatory numeric: must be a real entered number (blank = NaN → fails).
// Accept number-or-NaN at the type level so a blank field reports the friendly
// "Required" (not Zod's "Expected number, received nan").
const reqNum = z.number().or(z.nan()).refine((v) => Number.isFinite(v), "Required");
// Lenient (auto/derived fields we don't force the user to fill).
const auto = z.number().or(z.nan());

export const hiringSchema = z.object({
  baseLocation: z.string().min(2, "Required"),
  states: z.array(z.string()).min(1, "Select at least one state"),
  districts: z.array(z.string()).min(1, "Select at least one district"),
  blocks: z.array(z.string()).optional().default([]),
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

// Mandatory: total + the three core category targets + AOV.
// STEM and Panel are optional (auto) — they can be left blank.
export const revenueSchema = z.object({
  totalRevenueTarget: reqNum,
  earlyYearsTarget: reqNum,
  mathScienceTarget: reqNum,
  otherCategoriesTarget: reqNum, // labelled "Other Books" in the UI
  stemTarget: auto,
  panelTarget: auto,
  targetAov: reqNum,
});

export const categorySchema = z.object({
  category: z.string(),
  currentCount: auto,
  activeCount: auto,
  userCount: auto,
  targetCount: reqNum,
  samplingCount: reqNum,
  conversionCount: reqNum,
  projectedRevenue: auto,
  projectedConversion: auto,
});

// Mandatory: School Types (categories) + Retention (count & value).
export const universeSchema = z.object({
  categories: z.array(categorySchema),
  retentionSchoolCount: reqNum,
  retentionPlanValue: reqNum,
  bulkDealOpportunities: auto, // Bulk deals are optional
});

export const samplingSchema = z.object({
  userSchoolsSampling: reqNum,
  nonUserSchoolsSampling: reqNum,
  testPrepSampling: reqNum,
  earlyYearsSampling: reqNum,
  msSampling: reqNum,
  stemSampling: reqNum,
  panelSampling: auto, // no input field — not collected, so not mandatory
});

// Trainings & Workshops are optional.
export const trainingSchema = z.object({
  userSchoolTrainings: auto,
  nonUserSchoolTrainings: auto,
  digitalTrainings: auto,
  physicalTrainings: auto,
  teacherWorkshops: auto,
  principalWorkshops: auto,
  stemWorkshops: auto,
  productDemonstrations: auto,
});

// Collection is fully auto-derived from the revenue target + region phasing,
// so it never blocks submission. Rows are validated leniently if present.
export const collectionSchema = z.object({
  milestoneRows: z
    .array(
      z.object({
        id: z.string(),
        month: z.string(),
        collectionPct: auto,
        collectionAmount: auto,
        cumulativeAmount: auto,
      }),
    )
    .optional(),
});

export type StageKey =
  | "revenue"
  | "universe"
  | "sampling"
  | "training"
  | "collection";

export const stageSchemas: Record<StageKey, z.ZodTypeAny> = {
  revenue: revenueSchema,
  universe: universeSchema,
  sampling: samplingSchema,
  training: trainingSchema,
  collection: collectionSchema,
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
