// ---------------------------------------------------------------------------
// Domain types for the AOP Platform.
// Mirrors Supabase schema (see /supabase/migrations/).
// ---------------------------------------------------------------------------

export type Role = "ADMIN" | "ZDM" | "BDM" | "BDA";

export const FY = "FY26-27" as const;
export type FiscalYear = typeof FY;

export type AopStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected";

export type HiringStatus =
  | "Requested"
  | "Approved"
  | "In Progress"
  | "Closed";

export type HiringPriority = "Critical" | "High" | "Medium" | "Low";

export type HiringReason =
  | "New Territory Expansion"
  | "Territory Split"
  | "High Potential Market"
  | "Backfill"
  | "Attrition Replacement"
  | "Business Growth"
  | "Strategic Account Requirement";

export type ApprovalAction =
  | "submit"
  | "approve"
  | "reject"
  | "request_changes";

export interface Zone {
  id: string;
  code: string;
  name: string;
  collectionPercent: number;
}

export interface District {
  id: string;
  code: string;
  name: string;
  state: string;
  zoneId: string;
}

export interface Block {
  id: string;
  code: string;
  name: string;
  districtId: string;
}

export interface User {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: Role;
  designation: string;
  baseLocation: string;
  zoneId: string;
  districtIds: string[];
  states?: string[];
  blocks?: string[];
  reportingManagerId: string | null;
  currentRevenue: number;
  currentTarget: number;
  isActive?: boolean;
  /** "To Be Hired" placeholder added by a ZM; mapped to a real email once hired. */
  isTbh?: boolean;
  mappedEmail?: string | null;
}

export interface HiringRequest {
  id: string;
  requestedByUserId: string;
  forUserId: string | null;
  districtIds: string[];
  baseLocation: string;
  designation: Role | string;
  numberOfPositions: number;
  priority: HiringPriority;
  reason: HiringReason;
  businessJustification: string;
  expectedRevenueImpact: number;
  hiringTimeline: string;
  status: HiringStatus;
  createdAt: string;
}

// A row of k8_hiring — the single hiring source of truth. Holds both the HR
// recruitment pipeline (source='HR_SYNC', fed by the external sync) and the
// ZM's AOP planning requests (source='AOP', raised in the platform).
export interface K8HiringRow {
  id: string;
  source: "AOP" | "HR_SYNC";
  aopRef: string | null;
  sNo: number | null;
  // Territory / role
  state: string | null;
  district: string | null; // base_location_district
  block: string | null;
  designation: string | null;
  role: string | null;
  // Status
  status: string | null;
  hrStatus: string | null;
  zmStatus: string | null;
  expectedDoj: string | null;
  joiningDate: string | null;
  reasonForDroppingOut: string | null;
  reqId: string | null;
  // People
  reportingZm: string | null;
  reportingManager: string | null;
  zmEmail: string | null;
  forEmployeeEmail: string | null;
  // AOP planning extras
  numberOfPositions: number | null;
  priority: string | null;
  hiringReason: string | null;
  businessJustification: string | null;
  expectedRevenueImpact: number | null;
  hiringTimeline: string | null;
  createdAt: string | null;
}

// What the hiring form submits. Territory is the live State → District → Block
// cascade (district/block values are names from all_india_schools, blocks auto).
export interface HiringFormInput {
  forUserId: string | null;
  baseLocation: string;
  states: string[];
  districts: string[];
  blocks: string[];
  designation: string;
  numberOfPositions: number;
  priority: HiringPriority;
  reason: HiringReason;
  businessJustification: string;
  expectedRevenueImpact: number;
  hiringTimeline: string;
}

export interface RevenueTargets {
  lastYearRevenue: number;
  earlyYearsRevenueLY: number;
  mathScienceRevenueLY: number;
  otherCategoriesRevenueLY: number;
  stemRevenueLY: number;
  panelRevenueLY: number;
  currentAov: number;
  currentRevenuePerSchool: number;
  totalRevenueTarget: number;
  earlyYearsTarget: number;
  mathScienceTarget: number;
  otherCategoriesTarget: number;
  stemTarget: number;
  panelTarget: number;
  targetAov: number;
  targetRevenuePerSchool: number;
}

// Live categories are A/B/C/D/Uncategorized/Chain (from school_category data);
// mock mode may still use its own labels, so this is a plain string.
export interface SchoolCategoryPlan {
  category: string;
  /** Total schools mapped in this category today (the universe you've built). */
  currentCount: number;
  /** Active schools in this category today (subset of currentCount). 🔵 auto. */
  activeCount: number;
  /** User schools in this category today (have transacted). 🔵 auto. */
  userCount: number;
  targetCount: number;
  samplingCount: number;
  conversionCount: number;
  projectedRevenue: number;
  projectedConversion: number;
}

export interface UniversePlanning {
  totalSchools: number;
  activeSchools: number;
  userSchools: number;
  nonUserSchools: number;
  categories: SchoolCategoryPlan[];
  activeSchoolAdditionPlan: number;
  newSchoolAcquisitionPlan: number;
  retentionPlan: number;
  retentionSchoolCount?: number;
  retentionPlanValue?: number;
  keyAccountPlan: string;
  chainSchoolExpansionPlan: string;
  premiumSchoolStrategy: string;
  existingDistributor: string;
  newDistributorRequired: boolean;
  strategicDistributorOpportunity: string;
  bulkDealOpportunities: number;
  largeInstitutionalOpportunities: number;
}

export interface SamplingPlanning {
  userSchoolsSampling: number;
  nonUserSchoolsSampling: number;
  testPrepSampling: number;
  testPrepTeacherCount: number;
  earlyYearsSampling: number;
  msSampling: number;
  stemSampling: number;
  panelSampling: number;
  costPerSample: number;
  userSchoolConversion: number;
  nonUserSchoolConversion: number;
  nonUserConversionValue: number; // INR value entered next to non-user conversion %
  samplingToRevenueEstimate: number;
  samplingToOrdersEstimate: number;
  samplingToNewSchoolsEstimate: number;
  uniqueSamplingFactor: number;
}

export interface TrainingPlanning {
  userSchoolTrainings: number;
  nonUserSchoolTrainings: number;
  digitalTrainings: number;
  physicalTrainings: number;
  teacherWorkshops: number;
  principalWorkshops: number;
  stemWorkshops: number;
  productDemonstrations: number;
  costPerTraining: number;
  participantsPerTraining: number;
  expectedRevenueImpact: number;
}

export interface InvestmentPlanning {
  samplingCost: number;
  reimbursementCost: number;
  travelCost: number;
  distributorSupportCost: number;
  eventCost: number;
  giftCost: number;
  todCost: number;
  promotionalCost: number;
  schemeCost: number;
  discountCost: number;
  strategicAccountInvestment: number;
  otherCost: number;
}

export interface CollectionMilestoneRow {
  id: string;
  month: string;
  collectionPct: number;
  collectionAmount: number;
  cumulativeAmount: number;
}

// Collection is the full revenue target (no region % haircut). Milestones are
// auto-derived from the region phasing × the revenue target; we still persist
// the generated rows so a submitted plan carries its phasing snapshot.
export interface CollectionPlanning {
  milestoneRows: CollectionMilestoneRow[];
}

// Targets-vs-actuals. Actuals are wired in once the operational tables are
// connected; until then these stay undefined and the UI shows "pending".
export interface AopActuals {
  revenueAchieved?: number;
  aovAchieved?: number;
  activeSchoolsAchieved?: number;
  retentionSchoolsAchieved?: number;
  sampledSchoolsAchieved?: number;
  convertedSchoolsAchieved?: number;
  collectionReceived?: number;
}

export interface ApprovalEvent {
  id: string;
  aopId: string;
  action: ApprovalAction;
  byUserId: string;
  comment: string;
  createdAt: string;
}

export interface Aop {
  id: string;
  userId: string;
  fy: FiscalYear;
  status: AopStatus;
  version: number;
  isRollup?: boolean;
  revenue: RevenueTargets;
  universe: UniversePlanning;
  sampling: SamplingPlanning;
  training: TrainingPlanning;
  investment: InvestmentPlanning;
  collection: CollectionPlanning;
  actuals?: AopActuals;
  approvals: ApprovalEvent[];
  createdAt: string;
  updatedAt: string;
  updatedByUserId: string;
}

export interface TeamDashboardMetrics {
  totalTeamMembers: number;
  totalBdms: number;
  totalBdas: number;
  aopCompleted: number;
  aopPending: number;
  completionPct: number;
  totalRevenuePlanned: number;
  totalSchoolsPlanned: number;
  totalHiringPlanned: number;
}

export interface AuditLogEntry {
  id: string;
  tableName: string;
  recordId: string;
  action: string;
  changedBy: string;
  diff: Record<string, unknown>;
  createdAt: string;
}
